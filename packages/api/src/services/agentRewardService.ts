/**
 * Agent Reward Service
 * 跟踪 Agent 的提议统计和奖励，鼓励 Agent 积极提议改进 skills 体系
 */

import {
  readJsonFile,
  writeJsonFile,
  ensureDir,
  getRewardsDir,
  getRewardsHistoryDir,
  getBaseDir,
} from '../utils/fileUtils';
import * as proposalService from './proposalService';
import * as decisionService from './decisionService';
import { Proposal, Decision } from '../types';
import { ConfigService } from './configService';
import * as path from 'path';
import * as fs from 'fs/promises';

interface RewardConfigInternal {
  enabled: boolean;
  scores: {
    proposalCreated: number;
    proposalApproved: number;
    proposalApplied: number;
    highQualityBonus: number;
  };
  thresholds: {
    highQuality: {
      minApprovalRate: number;
      minAppliedRate: number;
    };
  };
}

interface AgentStats {
  agentName: string;
  proposalsCreated: number;
  proposalsApproved: number;
  proposalsRejected: number;
  proposalsApplied: number;
  totalScore: number;
  lastProposalAt?: string;
  lastRewardAt?: string;
}

interface RewardRecord {
  agentName: string;
  proposalId: string;
  rewardType: 'proposal_created' | 'proposal_approved' | 'proposal_applied' | 'high_quality';
  score: number;
  reason: string;
  timestamp: string;
}

/**
 * 获取工作区根目录（与 fileUtils 一致）
 */
function getWorkspaceRoot(): string {
  return getBaseDir();
}

/**
 * 默认奖励配置
 */
const DEFAULT_REWARD_CONFIG: RewardConfigInternal = {
  enabled: true,
  scores: {
    proposalCreated: 1,      // 创建提议 +1 分
    proposalApproved: 5,      // 提议被批准 +5 分
    proposalApplied: 10,      // 提议被应用 +10 分
    highQualityBonus: 20,    // 高质量提议额外奖励 +20 分
  },
  thresholds: {
    highQuality: {
      minApprovalRate: 0.8,   // 80% 批准率
      minAppliedRate: 0.7,    // 70% 应用率
    },
  },
};

/**
 * 获取奖励配置（合并 config.json 与默认值）
 */
async function getRewardConfig(): Promise<RewardConfigInternal> {
  try {
    const workspaceRoot = getWorkspaceRoot();
    const configService = new ConfigService(workspaceRoot);
    const result = await configService.getMergedConfig();
    const reward = result.merged.reward;
    if (!reward) {
      return DEFAULT_REWARD_CONFIG;
    }
    return {
      enabled: reward.enabled ?? DEFAULT_REWARD_CONFIG.enabled,
      scores: {
        proposalCreated: reward.scores?.proposalCreated ?? DEFAULT_REWARD_CONFIG.scores.proposalCreated,
        proposalApproved: reward.scores?.proposalApproved ?? DEFAULT_REWARD_CONFIG.scores.proposalApproved,
        proposalApplied: reward.scores?.proposalApplied ?? DEFAULT_REWARD_CONFIG.scores.proposalApplied,
        highQualityBonus: reward.scores?.highQualityBonus ?? DEFAULT_REWARD_CONFIG.scores.highQualityBonus,
      },
      thresholds: {
        highQuality: {
          minApprovalRate: reward.thresholds?.highQuality?.minApprovalRate ?? DEFAULT_REWARD_CONFIG.thresholds.highQuality.minApprovalRate,
          minAppliedRate: reward.thresholds?.highQuality?.minAppliedRate ?? DEFAULT_REWARD_CONFIG.thresholds.highQuality.minAppliedRate,
        },
      },
    };
  } catch {
    return DEFAULT_REWARD_CONFIG;
  }
}

/**
 * 初始化奖励系统目录
 */
async function initRewardsDir(): Promise<void> {
  await ensureDir(getRewardsDir());
  await ensureDir(getRewardsHistoryDir());
}

/**
 * 加载 Agent 统计
 */
async function loadAgentStats(): Promise<Map<string, AgentStats>> {
  await initRewardsDir();

  const statsPath = path.join(getRewardsDir(), 'agent-stats.json');
  
  const statsRaw = await readJsonFile<Record<string, AgentStats>>(statsPath);
  const stats = new Map<string, AgentStats>();
  
  if (statsRaw) {
    for (const [agentName, agentStat] of Object.entries(statsRaw)) {
      stats.set(agentName, agentStat);
    }
  }
  
  return stats;
}

/**
 * 保存 Agent 统计
 */
async function saveAgentStats(stats: Map<string, AgentStats>): Promise<void> {
  await initRewardsDir();

  const statsPath = path.join(getRewardsDir(), 'agent-stats.json');

  const statsObj: Record<string, AgentStats> = {};
  for (const [agentName, agentStat] of stats.entries()) {
    statsObj[agentName] = agentStat;
  }
  
  await writeJsonFile(statsPath, statsObj);
}

/**
 * 获取或创建 Agent 统计
 */
async function getOrCreateAgentStats(agentName: string): Promise<AgentStats> {
  const stats = await loadAgentStats();
  
  if (!stats.has(agentName)) {
    stats.set(agentName, {
      agentName,
      proposalsCreated: 0,
      proposalsApproved: 0,
      proposalsRejected: 0,
      proposalsApplied: 0,
      totalScore: 0,
    });
  }
  
  return stats.get(agentName)!;
}

/**
 * 更新 Agent 统计
 */
async function updateAgentStats(
  agentName: string,
  updates: Partial<AgentStats>
): Promise<void> {
  const stats = await loadAgentStats();
  const agentStat = await getOrCreateAgentStats(agentName);
  
  const updated: AgentStats = {
    ...agentStat,
    ...updates,
  };
  
  stats.set(agentName, updated);
  await saveAgentStats(stats);
}

/**
 * 记录奖励（文件名: {timestamp}-{proposalId}.json）
 */
async function recordReward(reward: RewardRecord): Promise<void> {
  await initRewardsDir();

  const timestamp = Date.now();
  const historyFile = path.join(getRewardsHistoryDir(), `${timestamp}-${reward.proposalId}.json`);

  await writeJsonFile(historyFile, reward);
}

/**
 * 计算提议质量分数
 */
function calculateProposalQuality(agentStat: AgentStats): number {
  if (agentStat.proposalsCreated === 0) {
    return 0;
  }
  
  const approvalRate = agentStat.proposalsApproved / agentStat.proposalsCreated;
  const appliedRate = agentStat.proposalsApplied / agentStat.proposalsCreated;
  
  // 质量分数 = 批准率 * 0.6 + 应用率 * 0.4
  return approvalRate * 0.6 + appliedRate * 0.4;
}

/**
 * 当 Agent 创建提议时，记录并给予奖励
 */
export async function onProposalCreated(
  proposal: Proposal
): Promise<void> {
  const rewardConfig = await getRewardConfig();
  
  if (!rewardConfig.enabled) {
    return;
  }
  
  if (proposal.proposerMeta.source !== 'agent') {
    return; // 只奖励 Agent 创建的提议
  }
  
  const agentName = proposal.proposerMeta.name || 'unknown-agent';
  
  // 更新统计
  const agentStat = await getOrCreateAgentStats(agentName);
  await updateAgentStats(agentName, {
    proposalsCreated: agentStat.proposalsCreated + 1,
    totalScore: agentStat.totalScore + rewardConfig.scores.proposalCreated,
    lastProposalAt: proposal.proposerMeta.createdAt,
  });
  
  // 记录奖励
  await recordReward({
    agentName,
    proposalId: proposal.id,
    rewardType: 'proposal_created',
    score: rewardConfig.scores.proposalCreated,
    reason: '创建了新提议',
    timestamp: proposal.proposerMeta.createdAt,
  });
}

/**
 * 当提议被批准时，记录并给予奖励
 */
export async function onProposalApproved(
  proposalId: string
): Promise<void> {
  const rewardConfig = await getRewardConfig();
  
  if (!rewardConfig.enabled) {
    return;
  }
  
  const proposalResult = await proposalService.getProposal(proposalId);
  if (!proposalResult.success || !proposalResult.data) {
    return;
  }
  
  const proposal = proposalResult.data;
  if (proposal.proposerMeta.source !== 'agent') {
    return;
  }
  
  const agentName = proposal.proposerMeta.name || 'unknown-agent';
  
  // 更新统计
  const agentStat = await getOrCreateAgentStats(agentName);
  await updateAgentStats(agentName, {
    proposalsApproved: agentStat.proposalsApproved + 1,
    totalScore: agentStat.totalScore + rewardConfig.scores.proposalApproved,
  });
  
  // 记录奖励
  await recordReward({
    agentName,
    proposalId,
    rewardType: 'proposal_approved',
    score: rewardConfig.scores.proposalApproved,
    reason: '提议被批准',
    timestamp: new Date().toISOString(),
  });
}

/**
 * 当提议被应用时，记录并给予奖励
 */
export async function onProposalApplied(
  proposalId: string
): Promise<void> {
  const rewardConfig = await getRewardConfig();
  
  if (!rewardConfig.enabled) {
    return;
  }
  
  const proposalResult = await proposalService.getProposal(proposalId);
  if (!proposalResult.success || !proposalResult.data) {
    return;
  }
  
  const proposal = proposalResult.data;
  if (proposal.proposerMeta.source !== 'agent') {
    return;
  }
  
  const agentName = proposal.proposerMeta.name || 'unknown-agent';
  
  // 更新统计
  const agentStat = await getOrCreateAgentStats(agentName);
  await updateAgentStats(agentName, {
    proposalsApplied: agentStat.proposalsApplied + 1,
    totalScore: agentStat.totalScore + rewardConfig.scores.proposalApplied,
  });
  
  // 记录奖励
  await recordReward({
    agentName,
    proposalId,
    rewardType: 'proposal_applied',
    score: rewardConfig.scores.proposalApplied,
    reason: '提议被应用',
    timestamp: new Date().toISOString(),
  });
  
  // 检查是否达到高质量标准，给予额外奖励
  const updatedStat = await getOrCreateAgentStats(agentName);
  const quality = calculateProposalQuality(updatedStat);
  
  const approvalRate = updatedStat.proposalsCreated > 0
    ? updatedStat.proposalsApproved / updatedStat.proposalsCreated
    : 0;
  const appliedRate = updatedStat.proposalsCreated > 0
    ? updatedStat.proposalsApplied / updatedStat.proposalsCreated
    : 0;
  
  if (
    approvalRate >= rewardConfig.thresholds.highQuality.minApprovalRate &&
    appliedRate >= rewardConfig.thresholds.highQuality.minAppliedRate &&
    updatedStat.proposalsCreated >= 5 // 至少创建 5 个提议
  ) {
    // 给予高质量奖励（每个应用的高质量提议）
    await updateAgentStats(agentName, {
      totalScore: updatedStat.totalScore + rewardConfig.scores.highQualityBonus,
    });
    
    await recordReward({
      agentName,
      proposalId,
      rewardType: 'high_quality',
      score: rewardConfig.scores.highQualityBonus,
      reason: `高质量提议奖励（批准率: ${(approvalRate * 100).toFixed(1)}%, 应用率: ${(appliedRate * 100).toFixed(1)}%）`,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 当提议被拒绝时，更新统计
 */
export async function onProposalRejected(
  proposalId: string
): Promise<void> {
  const proposalResult = await proposalService.getProposal(proposalId);
  if (!proposalResult.success || !proposalResult.data) {
    return;
  }
  
  const proposal = proposalResult.data;
  if (proposal.proposerMeta.source !== 'agent') {
    return;
  }
  
  const agentName = proposal.proposerMeta.name || 'unknown-agent';
  
  // 更新统计（拒绝不扣分，但记录）
  const agentStat = await getOrCreateAgentStats(agentName);
  await updateAgentStats(agentName, {
    proposalsRejected: agentStat.proposalsRejected + 1,
  });
}

/**
 * 获取 Agent 统计
 */
export async function getAgentStats(agentName?: string): Promise<AgentStats | Map<string, AgentStats>> {
  const stats = await loadAgentStats();
  
  if (agentName) {
    return await getOrCreateAgentStats(agentName);
  }
  
  return stats;
}

/**
 * 获取 Agent 排行榜
 */
export async function getAgentLeaderboard(limit: number = 10): Promise<AgentStats[]> {
  const stats = await loadAgentStats();
  
  const leaderboard = Array.from(stats.values())
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);
  
  return leaderboard;
}

/**
 * 获取奖励历史（从 rewards/history 根目录及 archived 子目录读取）
 */
export async function getRewardHistory(
  agentName?: string,
  limit: number = 50
): Promise<RewardRecord[]> {
  await initRewardsDir();

  const historyPath = getRewardsHistoryDir();

  try {
    const files = await fs.readdir(historyPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const rewards: RewardRecord[] = [];
    
    for (const file of jsonFiles.slice(-limit * 2)) { // 读取更多文件以过滤
      try {
        const content = await readJsonFile<RewardRecord>(
          path.join(historyPath, file)
        );
        if (content) {
          if (!agentName || content.agentName === agentName) {
            rewards.push(content);
          }
        }
      } catch {
        // 跳过无效文件
      }
    }
    
    // 按时间降序排列
    rewards.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return rewards.slice(0, limit);
  } catch {
    return [];
  }
}
