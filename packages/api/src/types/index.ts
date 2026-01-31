/**
 * OpenSkills API 类型定义
 */

// ============ Preferences 类型 ============

export interface NotificationSettings {
  newProposal: boolean;
  decisionMade: boolean;
  wakeTriggered: boolean;
}

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  defaultProposalFilter: 'all' | 'pending' | 'approved' | 'rejected';
  notifications: NotificationSettings;
  shortcuts?: Record<string, string>;
}

export interface PreferencesHistoryEntry {
  id: string;
  timestamp: string;
  before: Partial<Preferences>;
  after: Partial<Preferences>;
  diff: Record<string, { from: unknown; to: unknown }>;
}

// ============ Config 类型 ============

export type AdminMode = 'human_only' | 'agent_only' | 'agent_then_human';

export interface ProposalValidityConfig {
  retentionDays: number;
}

export interface CrawlConfig {
  enabled: boolean;
  schedule: string;
  minStars: number;
  topics: string[];
  githubToken: string;
}

export interface WakeConfig {
  enabled: boolean;
  schedule: string;
  reminderPrompt: string;
}

export interface HandoffConfig {
  maxContextTokens: number;
  compressWhenAbove: number;
}

export interface MergeThresholdConfig {
  fileCount: number;
  retentionDays: number;
}

export interface MergeStrategyConfig {
  byDate: boolean;
  byStatus: boolean;
  archiveOld: boolean;
}

export interface MergeConfig {
  enabled: boolean;
  schedule: string;
  threshold: MergeThresholdConfig;
  strategy: MergeStrategyConfig;
  lockTimeout?: number;
}

export interface AgentAutoProposeConfig {
  enabled: boolean;
  qualityThreshold?: {
    minReasonLength?: number;
    requireDiff?: boolean;
  };
}

export interface RewardConfig {
  enabled: boolean;
  scores?: {
    proposalCreated?: number;
    proposalApproved?: number;
    proposalApplied?: number;
    highQualityBonus?: number;
  };
  thresholds?: {
    highQuality?: {
      minApprovalRate?: number;
      minAppliedRate?: number;
    };
  };
}

export interface Config {
  adminMode: AdminMode;
  skillsAdminSkillRef: string;
  proposalValidity: ProposalValidityConfig;
  crawl: CrawlConfig;
  wake: WakeConfig;
  handoff: HandoffConfig;
  merge?: MergeConfig;
  agentAutoPropose?: AgentAutoProposeConfig;
  reward?: RewardConfig;
}

// 别名，用于向后兼容
export type OpenSkillsConfig = Config;

export interface ConfigSchema {
  properties: Record<string, {
    type: string;
    description: string;
    default?: unknown;
    enum?: string[];
    properties?: Record<string, unknown>;
  }>;
}

// ============ Proposal 类型 ============

export type ProposalScope = 'user' | 'project';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied';
export type ProposalTrigger = 'human' | 'agent' | 'crawler';

export interface ProposerMeta {
  source: string;
  name?: string;
  reason?: string;
  createdAt: string;
}

export interface Proposal {
  id: string;
  skillName: string;
  scope: ProposalScope;
  reason: string;
  diff: string;
  trigger: ProposalTrigger;
  proposerMeta: ProposerMeta;
  status: ProposalStatus;
}

export interface ProposalSummary {
  id: string;
  skillName: string;
  scope: ProposalScope;
  status: ProposalStatus;
  trigger: ProposalTrigger;
  createdAt: string;
}

export interface ProposalCreateInput {
  skillName: string;
  scope: ProposalScope;
  reason: string;
  diff: string;
  trigger: ProposalTrigger;
  proposerMeta: Omit<ProposerMeta, 'createdAt'>;
}

export interface ProposalUpdateInput {
  status?: ProposalStatus;
  /** 由 skills-admin 润色自然语言提议时填写的合法 diff */
  diff?: string;
}

export interface ProposalQueryParams {
  status?: ProposalStatus;
  scope?: ProposalScope;
  trigger?: ProposalTrigger;
  limit?: number;
  summary?: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  limit: number;
  error?: string;
}

// ============ Decision 类型 ============

export type DeciderType = 'human' | 'agent';
export type DecisionType = 'approve' | 'reject';

export interface Decision {
  proposalId: string;
  decision: DecisionType;
  reason: string;
  decidedBy: DeciderType;
  decidedAt: string;
  appliedAt?: string;
}

export interface DecisionCreateInput {
  proposalId: string;
  decision: DecisionType;
  reason: string;
  decidedBy: DeciderType;
}

export interface DecisionQueryParams {
  limit?: number;
  search?: string;
}

// ============ History 类型 ============

export interface HistoryEntry {
  id: string;
  proposalId: string;
  skillName: string;
  skillPath: string;
  scope: ProposalScope;
  diff: string;
  originalContent: string;
  appliedAt: string;
  appliedBy: DeciderType;
  rolledBackAt?: string;
}

export interface HistoryQueryParams {
  limit?: number;
  skillName?: string;
  search?: string;
}

// ============ Diff 类型 ============

export interface DiffApplyResult {
  success: boolean;
  newContent?: string;
  historyId?: string;
  error?: string;
}

export interface DiffRevertResult {
  success: boolean;
  restoredContent?: string;
  error?: string;
}

// ============ API 响应类型 ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface MergedResult<T> {
  merged: T;
  sources: {
    user: Partial<T> | null;
    project: Partial<T> | null;
  };
}

// ============ 默认值 ============

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  sidebarCollapsed: false,
  defaultProposalFilter: 'all',
  notifications: {
    newProposal: true,
    decisionMade: true,
    wakeTriggered: false
  }
};

export const DEFAULT_CONFIG: Config = {
  adminMode: 'agent_then_human',
  skillsAdminSkillRef: 'skills-admin',
  proposalValidity: {
    retentionDays: 90
  },
  agentAutoPropose: {
    enabled: false,
    qualityThreshold: {
      minReasonLength: 20,
      requireDiff: true,
    },
  },
  reward: {
    enabled: true,
    scores: {
      proposalCreated: 1,
      proposalApproved: 5,
      proposalApplied: 10,
      highQualityBonus: 20,
    },
    thresholds: {
      highQuality: {
        minApprovalRate: 0.8,
        minAppliedRate: 0.7,
      },
    },
  },
  crawl: {
    enabled: true,
    schedule: '0 */4 * * *',
    minStars: 100,
    topics: ['cursor-skills'],
    githubToken: ''
  },
  wake: {
    enabled: true,
    schedule: '0 */4 * * *',
    reminderPrompt: '检查 pending proposals 并继续审查'
  },
  handoff: {
    maxContextTokens: 50000,
    compressWhenAbove: 40000
  },
  merge: {
    enabled: true,
    schedule: '0 3 * * *',
    threshold: {
      fileCount: 100,
      retentionDays: 30
    },
    strategy: {
      byDate: true,
      byStatus: true,
      archiveOld: true
    },
    lockTimeout: 1800
  }
};
