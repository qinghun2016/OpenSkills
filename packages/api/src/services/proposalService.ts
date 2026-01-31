/**
 * Proposal Service
 * Handles CRUD operations for proposals.
 *
 * 存储约定：同一 proposal 可能同时存在于 proposals/{id}.json（root）与 proposals/active/{id}.json。
 * Merge 会把 root 下的 pending 移到 active/；批准/拒绝时只写 root 会留下 active/ 副本，导致 getProposal
 * 优先读到 active/ 的旧状态、删除只删 root 导致“删不掉”。因此 updateProposal 在状态变为非 pending 时
 * 必须删除 active/ 副本，deleteProposal 必须同时删除 root 与 active/，list/get 按 id 去重并优先采用非 pending 版本。
 */

import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import {
  readJsonFile,
  writeJsonFile,
  listJsonFiles,
  getProposalsDir,
  getProposalPath,
  deleteFile,
  getActiveDir,
  getArchivedDir,
} from '../utils/fileUtils';
import { validateProposal } from '../utils/schemaValidator';
import { checkDiffSafety, checkDiffTargetPaths } from '../utils/diffSafety';
import { acquireLock, releaseLock } from '../utils/lockUtils';
import {
  readAllFromArchives,
  findEntryInArchives,
} from '../utils/archiveReader';
import {
  Proposal,
  ProposalSummary,
  ProposalCreateInput,
  ProposalUpdateInput,
  ProposalQueryParams,
  ProposalTrigger,
  PaginatedResponse,
  ApiResponse,
} from '../types';
import { ConfigService } from './configService';
import * as agentRewardService from './agentRewardService';
import * as decisionService from './decisionService';

/**
 * Create a new proposal
 */
export async function createProposal(
  input: ProposalCreateInput
): Promise<ApiResponse<Proposal>> {
  const lockOperation = 'proposal-create';
  const lockAcquired = await acquireLock(lockOperation);
  
  if (!lockAcquired) {
    return {
      success: false,
      error: 'Another proposal operation is in progress. Please try again later.',
    };
  }

  try {
    const proposerMeta = input.proposerMeta && typeof input.proposerMeta === 'object'
      ? { ...input.proposerMeta, createdAt: new Date().toISOString() }
      : { source: 'unknown', createdAt: new Date().toISOString() };
    const proposal: Proposal = {
      id: uuidv4(),
      skillName: input.skillName,
      scope: input.scope,
      reason: input.reason,
      diff: input.diff,
      trigger: input.trigger ?? 'human',
      proposerMeta,
      status: 'pending',
    };

    // Validate against schema
    const validation = await validateProposal(proposal);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errorMessage || 'Validation failed',
      };
    }

    const filePath = getProposalPath(proposal.id);
    await writeJsonFile(filePath, proposal);

    // 记录奖励（如果启用）；失败不影响提议创建
    try {
      await agentRewardService.onProposalCreated(proposal);
    } catch (rewardErr) {
      console.warn('[ProposalService] Reward record failed:', rewardErr instanceof Error ? rewardErr.message : rewardErr);
    }

    // 在 agent_only 模式下，如果 Agent 创建的提议质量高，自动审查和应用
    // 这样可以避免 Agent 直接编辑文件时需要用户确认的问题
    if (input.trigger === 'agent' && input.proposerMeta?.source === 'agent') {
      try {
        const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
        const configService = new ConfigService(workspaceRoot);
        const configResult = await configService.getMergedConfig();
        const adminMode = configResult.merged.adminMode;
        const autoPropose = configResult.merged.agentAutoPropose;

        // 如果启用了 agentAutoPropose，自动审查和应用高质量的提议
        if (adminMode === 'agent_only' && autoPropose?.enabled) {
          // 快速审查：检查提议质量
          const qualityCheck = quickQualityCheck(proposal, autoPropose.qualityThreshold);
          
          if (qualityCheck.shouldAutoApprove) {
            // 自动批准并应用
            const decisionResult = await decisionService.createDecision({
              proposalId: proposal.id,
              decision: 'approve',
              reason: qualityCheck.reason || '自动审查通过：提议质量高，符合规范',
              decidedBy: 'agent',
            });

            if (decisionResult.success) {
              return {
                success: true,
                data: proposal,
                message: 'Proposal created and auto-approved (agent_only + autoPropose mode)',
              };
            }
          }
        }
      } catch (error) {
        // 自动审查失败，不影响提议创建，只记录警告
        console.warn('[ProposalService] Failed to auto-review proposal:', error);
      }
    }

    return {
      success: true,
      data: proposal,
      message: 'Proposal created successfully',
    };
  } finally {
    await releaseLock(lockOperation);
  }
}

/**
 * 快速质量检查（用于自动审查）
 */
function quickQualityCheck(
  proposal: Proposal,
  threshold?: { minReasonLength?: number; requireDiff?: boolean }
): {
  shouldAutoApprove: boolean;
  reason?: string;
} {
  const minReasonLength = threshold?.minReasonLength ?? 20;
  const requireDiff = threshold?.requireDiff ?? true;

  // 基本检查
  if (!proposal.reason || proposal.reason.length < minReasonLength) {
    return { shouldAutoApprove: false, reason: `提议理由过于简短（需要至少 ${minReasonLength} 字符）` };
  }

  if (requireDiff && (!proposal.diff || proposal.diff.length < 50)) {
    return { shouldAutoApprove: false, reason: 'Diff 内容过短或缺失' };
  }

  const safety = checkDiffSafety(proposal.diff);
  if (!safety.safe) {
    return { shouldAutoApprove: false, reason: safety.reason };
  }
  const pathCheck = checkDiffTargetPaths(proposal.diff);
  if (!pathCheck.safe) {
    return { shouldAutoApprove: false, reason: pathCheck.reason };
  }

  // 如果通过所有检查，可以自动批准
  return {
    shouldAutoApprove: true,
    reason: '提议质量高，符合规范，自动批准',
  };
}

/**
 * Get a proposal by ID
 * Searches in the following order:
 * 1. active/ directory (for pending proposals)
 * 2. Root directory (backward compatibility)
 * 3. archived/ directory (merged archive files)
 */
export async function getProposal(id: string): Promise<ApiResponse<Proposal>> {
  const activeDir = getActiveDir('proposals');
  const activePath = path.join(activeDir, `${id}.json`);
  const rootPath = getProposalPath(id);
  const rawFromActive = await readJsonFile<any>(activePath);
  const rawFromRoot = await readJsonFile<any>(rootPath);

  // 当 root 与 active 同时存在时，优先采用非 pending 的版本，与决策一致
  let proposalRaw = rawFromRoot && rawFromActive
    ? (rawFromRoot.status !== 'pending' ? rawFromRoot : rawFromActive)
    : (rawFromActive ?? rawFromRoot);

  // 3. If still not found, search in archived files
  if (!proposalRaw) {
    const dirs = [
      getActiveDir('proposals'),
      getProposalsDir(),
      getArchivedDir('proposals'),
    ];
    proposalRaw = await findEntryInArchives<any>(dirs, 'id', id);
  }

  if (!proposalRaw) {
    return {
      success: false,
      error: 'Proposal not found',
    };
  }

    // 规范化 trigger 字段：确保是有效的 ProposalTrigger 值
    let trigger: ProposalTrigger = 'human'; // 默认值
    if (proposalRaw.trigger) {
      const triggerValue = proposalRaw.trigger.toLowerCase();
      if (triggerValue === 'agent' || triggerValue === 'crawler') {
        trigger = triggerValue as ProposalTrigger;
      } else if (triggerValue.includes('agent') || proposalRaw.submittedBy === 'agent') {
        trigger = 'agent';
      } else if (triggerValue.includes('crawl')) {
        trigger = 'crawler';
      } else {
        trigger = 'human';
      }
    } else if (proposalRaw.submittedBy === 'agent') {
      trigger = 'agent';
    }

    // 转换旧格式到新格式（兼容性处理）
    const proposal: Proposal = {
      id: proposalRaw.id,
      skillName: proposalRaw.skillName,
      scope: proposalRaw.scope,
      reason: proposalRaw.reason,
      diff: proposalRaw.diff,
      status: proposalRaw.status,
      trigger,
      // 处理 proposerMeta：如果存在则使用，否则从旧字段转换
      proposerMeta: proposalRaw.proposerMeta || {
        source: proposalRaw.submittedBy === 'agent' ? 'agent' : 'human',
        name: proposalRaw.submittedBy,
        createdAt: proposalRaw.submittedAt || proposalRaw.proposerMeta?.createdAt || new Date().toISOString(),
      },
    };

  return {
    success: true,
    data: proposal,
  };
}

/**
 * List proposals with optional filters
 * Reads from:
 * 1. proposals/active/ (for pending proposals)
 * 2. proposals/ (root directory, backward compatibility)
 * 3. proposals/archived/ (merged archive files)
 */
export async function listProposals(
  params: ProposalQueryParams = {}
): Promise<PaginatedResponse<Proposal | ProposalSummary>> {
  // Define directories to read from (in priority order)
  // readAllFromArchives will automatically read from archived/ subdirectories
  const dirs = [
    getActiveDir('proposals'),  // Active pending proposals (proposals/active/)
    getProposalsDir(),          // Root directory (proposals/) - includes archived/ subdirectory
  ];

  // Create filter function based on query params
  const filter = (proposal: Proposal): boolean => {
    if (params.status && proposal.status !== params.status) return false;
    if (params.scope && proposal.scope !== params.scope) return false;
    if (params.trigger && proposal.trigger !== params.trigger) return false;
    return true;
  };

  // Read all proposals from all directories
  const allProposalsRaw = await readAllFromArchives<any>(dirs, filter);

  // Convert to Proposal format (handle old format compatibility)
  let proposals: Proposal[] = allProposalsRaw.map(proposalRaw => {
    // 规范化 trigger 字段：确保是有效的 ProposalTrigger 值
    let trigger: ProposalTrigger = 'human'; // 默认值
    if (proposalRaw.trigger) {
      const triggerValue = proposalRaw.trigger.toLowerCase();
      if (triggerValue === 'agent' || triggerValue === 'crawler') {
        trigger = triggerValue as ProposalTrigger;
      } else if (triggerValue.includes('agent') || proposalRaw.submittedBy === 'agent') {
        trigger = 'agent';
      } else if (triggerValue.includes('crawl')) {
        trigger = 'crawler';
      } else {
        trigger = 'human';
      }
    } else if (proposalRaw.submittedBy === 'agent') {
      trigger = 'agent';
    }

    return {
      id: proposalRaw.id,
      skillName: proposalRaw.skillName,
      scope: proposalRaw.scope,
      reason: proposalRaw.reason,
      diff: proposalRaw.diff,
      status: proposalRaw.status,
      trigger,
      // 处理 proposerMeta：如果存在则使用，否则从旧字段转换
      proposerMeta: proposalRaw.proposerMeta || {
        source: proposalRaw.submittedBy === 'agent' ? 'agent' : 'human',
        name: proposalRaw.submittedBy,
        createdAt: proposalRaw.submittedAt || proposalRaw.proposerMeta?.createdAt || new Date().toISOString(),
      },
    };
  });

  // 按 id 去重：同一提议可能同时存在于 proposals/ 与 proposals/active/，取非 pending 者优先以与决策一致
  const byId = new Map<string, Proposal>();
  for (const p of proposals) {
    const existing = byId.get(p.id);
    if (!existing || (existing.status === 'pending' && p.status !== 'pending')) {
      byId.set(p.id, p);
    }
  }
  proposals = Array.from(byId.values());

  // 按事件顺序合并：请求 pending 时排除已有 decision 的 proposal，避免脏数据
  if (params.status === 'pending') {
    const idsWithDecisions = await decisionService.getProposalIdsWithDecisions();
    proposals = proposals.filter(p => !idsWithDecisions.has(p.id));
  }

  // Sort by createdAt descending
  proposals.sort((a, b) => {
    const aTime = a.proposerMeta?.createdAt || '';
    const bTime = b.proposerMeta?.createdAt || '';
    return bTime.localeCompare(aTime);
  });

  // Apply limit
  const limit = params.limit;
  const limited = limit ? proposals.slice(0, limit) : proposals;

  // Return summary if requested
  if (params.summary) {
    const summaries: ProposalSummary[] = limited.map(p => ({
      id: p.id,
      skillName: p.skillName,
      scope: p.scope,
      status: p.status,
      trigger: p.trigger,
      createdAt: p.proposerMeta?.createdAt || new Date().toISOString(),
    }));

    return {
      success: true,
      data: summaries,
      total: proposals.length,
      limit: limit || proposals.length,
    };
  }

  return {
    success: true,
    data: limited,
    total: proposals.length,
    limit: limit || proposals.length,
  };
}

/**
 * Update a proposal (mainly for status changes)
 */
export async function updateProposal(
  id: string,
  updates: ProposalUpdateInput
): Promise<ApiResponse<Proposal>> {
  const lockOperation = 'proposal-update';
  const lockAcquired = await acquireLock(lockOperation);
  
  if (!lockAcquired) {
    return {
      success: false,
      error: 'Another proposal operation is in progress. Please try again later.',
    };
  }

  try {
    const result = await getProposal(id);
    if (!result.success || !result.data) {
      return {
        success: false,
        error: 'Proposal not found',
      };
    }

    const proposal = result.data;

    // Update allowed fields
    if (updates.status) {
      proposal.status = updates.status;
    }
    if (updates.diff !== undefined) {
      if (proposal.status !== 'pending') {
        return {
          success: false,
          error: 'Only pending proposals can have their diff updated.',
        };
      }
      proposal.diff = updates.diff;
    }

    // Validate updated proposal
    const validation = await validateProposal(proposal);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errorMessage || 'Validation failed',
      };
    }

    const filePath = getProposalPath(id);
    await writeJsonFile(filePath, proposal);

    // 同步 active/ 副本：若状态已非 pending 则删除 active 副本，避免 getProposal 优先读到旧状态
    const activeDir = getActiveDir('proposals');
    const activePath = path.join(activeDir, `${id}.json`);
    if (updates.status && updates.status !== 'pending') {
      await deleteFile(activePath).catch(() => {});
    } else {
      try {
        await writeJsonFile(activePath, proposal);
      } catch {
        // active 目录可能不存在或只读，忽略
      }
    }

    return {
      success: true,
      data: proposal,
      message: 'Proposal updated successfully',
    };
  } finally {
    await releaseLock(lockOperation);
  }
}

/**
 * Delete a proposal
 */
export async function deleteProposal(id: string): Promise<ApiResponse<void>> {
  const lockOperation = 'proposal-delete';
  const lockAcquired = await acquireLock(lockOperation);
  
  if (!lockAcquired) {
    return {
      success: false,
      error: 'Another proposal operation is in progress. Please try again later.',
    };
  }

  try {
    const result = await getProposal(id);
    if (!result.success) {
      return {
        success: false,
        error: 'Proposal not found',
      };
    }

    // 同时删除 root 与 active/ 副本，避免同一 id 存于两处导致“删不掉”或状态分裂
    const filePath = getProposalPath(id);
    const activeDir = getActiveDir('proposals');
    const activePath = path.join(activeDir, `${id}.json`);
    const deletedRoot = await deleteFile(filePath);
    const deletedActive = await deleteFile(activePath).catch(() => false);

    if (!deletedRoot && !deletedActive) {
      return {
        success: false,
        error: 'Failed to delete proposal (not found in proposals/ or proposals/active/)',
      };
    }

    return {
      success: true,
      message: 'Proposal deleted successfully',
    };
  } finally {
    await releaseLock(lockOperation);
  }
}

/**
 * Get pending proposals count
 */
export async function getPendingCount(): Promise<number> {
  const result = await listProposals({ status: 'pending' });
  return result.total;
}

/**
 * Get proposals by skill name
 */
export async function getProposalsBySkillName(
  skillName: string
): Promise<Proposal[]> {
  const files = await listJsonFiles(getProposalsDir());
  const proposals: Proposal[] = [];

  for (const file of files) {
    const proposal = await readJsonFile<Proposal>(file);
    if (proposal && proposal.skillName === skillName) {
      proposals.push(proposal);
    }
  }

  return proposals;
}

/**
 * Check if a proposal exists
 */
export async function proposalExists(id: string): Promise<boolean> {
  const result = await getProposal(id);
  return result.success;
}
