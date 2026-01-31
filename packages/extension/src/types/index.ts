/**
 * OpenSkills Extension 类型定义
 * 复用 API 包的类型定义
 */

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

// ============ Config 类型 ============

export type AdminMode = 'human_only' | 'agent_only' | 'agent_then_human';

export interface Config {
  adminMode: AdminMode;
  skillsAdminSkillRef: string;
  proposalValidity: {
    retentionDays: number;
  };
  crawl: {
    enabled: boolean;
    schedule: string;
    minStars: number;
    topics: string[];
    githubToken: string;
  };
  wake: {
    enabled: boolean;
    schedule: string;
    reminderPrompt: string;
  };
  handoff: {
    maxContextTokens: number;
    compressWhenAbove: number;
  };
  merge?: {
    enabled: boolean;
    schedule: string;
    threshold: {
      fileCount: number;
      retentionDays: number;
    };
    strategy: {
      byDate: boolean;
      byStatus: boolean;
      archiveOld: boolean;
    };
    lockTimeout?: number;
  };
}

// ============ Decision 类型 ============

export interface Decision {
  proposalId: string;
  decision: 'approve' | 'reject';
  reason: string;
  adminAgent: string;
  timestamp: string;
  scope: ProposalScope;
}

// ============ Skill 类型 ============

export interface Skill {
  name: string;
  description: string;
  path: string;
  scope: ProposalScope;
}

// ============ API 响应类型 ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  limit: number;
  error?: string;
}

// ============ Extension 状态类型 ============

export interface ExtensionState {
  apiAvailable: boolean;
  initialized: boolean;
  pendingCount: number;
  adminMode: AdminMode;
}

// ============ TreeView 项目类型 ============

export type SkillTreeItemType = 'group' | 'skill';
export type ProposalTreeItemType = 'group' | 'proposal';
