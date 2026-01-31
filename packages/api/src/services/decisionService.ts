/**
 * Decision Service
 * Handles CRUD operations for decisions and applying approved changes
 */

import {
  readJsonFile,
  writeJsonFile,
  listJsonFiles,
  getDecisionsDir,
  getDecisionPath,
  getSkillPath,
} from '../utils/fileUtils';
import { validateDecision } from '../utils/schemaValidator';
import { acquireLock, releaseLock } from '../utils/lockUtils';
import * as proposalService from './proposalService';
import * as diffService from './diffService';
import * as historyService from './historyService';
import { ConfigService } from './configService';
import * as agentRewardService from './agentRewardService';
import {
  Decision,
  DecisionCreateInput,
  DecisionQueryParams,
  PaginatedResponse,
  ApiResponse,
  DiffApplyResult,
} from '../types';
import {
  readAllFromArchives,
  findEntryInArchives,
} from '../utils/archiveReader';
import * as path from 'path';

/**
 * Get workspace root directory
 */
function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_ROOT || process.cwd();
}

/**
 * Create a new decision
 */
export async function createDecision(
  input: DecisionCreateInput
): Promise<ApiResponse<Decision>> {
  const lockOperation = 'decision-create';
  const lockAcquired = await acquireLock(lockOperation);
  
  if (!lockAcquired) {
    return {
      success: false,
      error: 'Another decision operation is in progress. Please try again later.',
    };
  }

  try {
    // Check if proposal exists
    const proposalResult = await proposalService.getProposal(input.proposalId);
    if (!proposalResult.success || !proposalResult.data) {
      return {
        success: false,
        error: 'Proposal not found',
      };
    }

    const proposal = proposalResult.data;

    // Check if decision already exists — 按事件顺序合并：决策已存在则同步 proposal 状态，保证一致性
    const existingDecision = await getDecisionByProposalId(input.proposalId);
    if (existingDecision) {
      const effectiveStatus = existingDecision.decision === 'approve' ? 'approved' : 'rejected';
      const syncResult = await proposalService.updateProposal(input.proposalId, { status: effectiveStatus });
      return {
        success: true,
        data: existingDecision,
        message: syncResult.success
          ? 'Decision already exists for this proposal; proposal status synced to match decision (merge by event order).'
          : 'Decision already exists for this proposal; proposal status sync failed (file may be in archive).',
      };
    }

    const decision: Decision = {
      proposalId: input.proposalId,
      decision: input.decision,
      reason: input.reason,
      decidedBy: input.decidedBy,
      decidedAt: new Date().toISOString(),
    };

    // Validate against schema
    const validation = await validateDecision(decision);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errorMessage || 'Validation failed',
      };
    }

    // Update proposal status（失败则不保存 decision，避免状态分裂）
    const updateResult = await proposalService.updateProposal(input.proposalId, {
      status: input.decision === 'approve' ? 'approved' : 'rejected',
    });
    if (!updateResult.success) {
      return {
        success: false,
        error: updateResult.error || 'Failed to update proposal status; decision not saved to avoid inconsistent state.',
      };
    }

    // 记录奖励
    if (input.decision === 'approve') {
      await agentRewardService.onProposalApproved(input.proposalId);
    } else {
      await agentRewardService.onProposalRejected(input.proposalId);
    }

    // Save decision
    const filePath = getDecisionPath(input.proposalId);
    await writeJsonFile(filePath, decision);

    // 在 agent_only 模式下，如果 Agent 批准了提议，自动应用修改
    // 这样可以避免 Agent 直接编辑文件时需要用户确认的问题
    if (
      input.decision === 'approve' &&
      input.decidedBy === 'agent'
    ) {
      try {
        const workspaceRoot = getWorkspaceRoot();
        const configService = new ConfigService(workspaceRoot);
        const configResult = await configService.getMergedConfig();
        const adminMode = configResult.merged.adminMode;

        if (adminMode === 'agent_only') {
          // 自动应用修改
          const applyResult = await applyDecision(input.proposalId);
          if (applyResult.success) {
            return {
              success: true,
              data: decision,
              message: 'Decision recorded and applied automatically (agent_only mode)',
            };
          } else {
            // 应用失败，但决策已记录，返回警告
            return {
              success: true,
              data: decision,
              message: `Decision recorded, but auto-apply failed: ${applyResult.error}`,
            };
          }
        }
      } catch (error) {
        // 读取配置失败，不影响决策记录，只记录警告
        console.warn('[DecisionService] Failed to check adminMode for auto-apply:', error);
      }
    }

    return {
      success: true,
      data: decision,
      message: 'Decision recorded successfully',
    };
  } finally {
    await releaseLock(lockOperation);
  }
}

/**
 * Get the set of proposal IDs that already have a decision (root decisions dir).
 * Used to resolve effective status: pending list should exclude these (merge by event order).
 */
export async function getProposalIdsWithDecisions(): Promise<Set<string>> {
  const dir = getDecisionsDir();
  const files = await listJsonFiles(dir);
  const ids = new Set<string>();
  for (const fullPath of files) {
    const base = path.basename(fullPath, '.json');
    if (base) ids.add(base);
  }
  return ids;
}

/**
 * Get a decision by proposal ID
 * Checks root directory first (backward compatibility), then searches archived files
 */
export async function getDecisionByProposalId(
  proposalId: string
): Promise<Decision | null> {
  // First check root directory (backward compatibility)
  const filePath = getDecisionPath(proposalId);
  const decision = await readJsonFile<Decision>(filePath);
  if (decision) {
    return decision;
  }

  // If not found, search in archived files
  // readAllFromArchives will automatically check archived/ subdirectory
  const decisionsDir = getDecisionsDir();
  const dirs = [decisionsDir];
  
  return findEntryInArchives<Decision>(dirs, 'proposalId', proposalId);
}

/**
 * List all decisions with optional filters
 * Reads from root directory (backward compatibility) and archived files
 */
export async function listDecisions(
  params: DecisionQueryParams = {}
): Promise<PaginatedResponse<Decision>> {
  const decisionsDir = getDecisionsDir();
  
  // Read from root directory and archived files
  // readAllFromArchives will automatically check archived/ subdirectory
  const dirs = [decisionsDir];
  const allDecisions = await readAllFromArchives<Decision>(dirs);

  // Apply search filter if provided
  let decisions = allDecisions;
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    decisions = allDecisions.filter(decision => {
      // Search in proposalId, reason, and decidedBy
      return (
        decision.proposalId.toLowerCase().includes(searchLower) ||
        decision.reason.toLowerCase().includes(searchLower) ||
        decision.decidedBy.toLowerCase().includes(searchLower)
      );
    });
  }

  // Sort by decidedAt descending
  decisions.sort((a, b) => 
    new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime()
  );

  // Apply limit
  const limit = params.limit;
  const limited = limit ? decisions.slice(0, limit) : decisions;

  return {
    success: true,
    data: limited,
    total: decisions.length,
    limit: limit || decisions.length,
  };
}

/**
 * Apply an approved decision's diff to the skill file
 */
export async function applyDecision(
  proposalId: string
): Promise<ApiResponse<DiffApplyResult>> {
  const lockOperation = 'decision-apply';
  const lockAcquired = await acquireLock(lockOperation);
  
  if (!lockAcquired) {
    return {
      success: false,
      error: 'Another decision operation is in progress. Please try again later.',
    };
  }

  try {
    // Get decision
    const decision = await getDecisionByProposalId(proposalId);
    if (!decision) {
      return {
        success: false,
        error: 'Decision not found',
      };
    }

    // Check if already applied
    if (decision.appliedAt) {
      return {
        success: false,
        error: 'Decision already applied',
      };
    }

    // Check if decision is approved
    if (decision.decision !== 'approve') {
      return {
        success: false,
        error: 'Cannot apply rejected decision',
      };
    }

    // Get proposal
    const proposalResult = await proposalService.getProposal(proposalId);
    if (!proposalResult.success || !proposalResult.data) {
      return {
        success: false,
        error: 'Proposal not found',
      };
    }

    const proposal = proposalResult.data;
    let skillPath: string;
    try {
      skillPath = getSkillPath(proposal.skillName, proposal.scope);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid skill path',
      };
    }

    // Apply the diff
    const applyResult = await diffService.applyDiff(skillPath, proposal.diff, {
      proposalId: proposal.id,
      skillName: proposal.skillName,
      scope: proposal.scope,
      appliedBy: decision.decidedBy,
    });

    if (!applyResult.success) {
      return {
        success: false,
        error: applyResult.error || 'Failed to apply diff',
      };
    }

    // Update decision with appliedAt
    decision.appliedAt = new Date().toISOString();
    const filePath = getDecisionPath(proposalId);
    await writeJsonFile(filePath, decision);

    // 记录奖励（提议被应用）
    await agentRewardService.onProposalApplied(proposalId);

    return {
      success: true,
      data: applyResult,
      message: 'Diff applied successfully',
    };
  } finally {
    await releaseLock(lockOperation);
  }
}

/**
 * Validate that a diff can be applied before creating a decision
 */
export async function validateDiffBeforeDecision(
  proposalId: string
): Promise<{ valid: boolean; error?: string }> {
  const proposalResult = await proposalService.getProposal(proposalId);
  if (!proposalResult.success || !proposalResult.data) {
    return { valid: false, error: 'Proposal not found' };
  }

  const proposal = proposalResult.data;
  let skillPath: string;
  try {
    skillPath = getSkillPath(proposal.skillName, proposal.scope);
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid skill path' };
  }
  return diffService.validateDiff(skillPath, proposal.diff);
}

/**
 * Preview what the skill will look like after applying a decision
 */
export async function previewDecisionApplication(
  proposalId: string
): Promise<{ success: boolean; preview?: string; error?: string }> {
  const proposalResult = await proposalService.getProposal(proposalId);
  if (!proposalResult.success || !proposalResult.data) {
    return { success: false, error: 'Proposal not found' };
  }

  const proposal = proposalResult.data;
  let skillPath: string;
  try {
    skillPath = getSkillPath(proposal.skillName, proposal.scope);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Invalid skill path' };
  }
  return diffService.previewDiff(skillPath, proposal.diff);
}

/**
 * Get statistics about decisions
 */
export async function getDecisionStats(): Promise<{
  total: number;
  approved: number;
  rejected: number;
  applied: number;
}> {
  const files = await listJsonFiles(getDecisionsDir());
  let total = 0;
  let approved = 0;
  let rejected = 0;
  let applied = 0;

  for (const file of files) {
    const decision = await readJsonFile<Decision>(file);
    if (decision) {
      total++;
      if (decision.decision === 'approve') approved++;
      if (decision.decision === 'reject') rejected++;
      if (decision.appliedAt) applied++;
    }
  }

  return { total, approved, rejected, applied };
}
