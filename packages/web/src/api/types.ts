/**
 * OpenSkills API 类型定义 (与后端同步)
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

export interface Config {
  adminMode: AdminMode;
  skillsAdminSkillRef: string;
  proposalValidity: ProposalValidityConfig;
  crawl: CrawlConfig;
  wake: WakeConfig;
  handoff: HandoffConfig;
  merge?: MergeConfig;
}

// ============ Proposal 类型 ============

export type ProposalScope = 'user' | 'project';
export type ProposalStatus = 'pending' | 'approved' | 'applied' | 'rejected';
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

/** 创建提议请求体（与后端 ProposalCreateInput 一致） */
export interface ProposalCreateInput {
  skillName: string;
  scope: ProposalScope;
  reason: string;
  diff: string;
  trigger: ProposalTrigger;
  proposerMeta: { source: string; name?: string; reason?: string };
}

// ============ Decision 类型 ============

export type DeciderType = 'human' | 'agent';

export interface Decision {
  id: string;
  proposalId: string;
  decision: 'approve' | 'reject';
  decidedBy: 'human' | 'agent';
  reason: string;
  decidedAt: string;
  proposal?: Proposal;
}

// ============ Skills 类型 ============

export interface Skill {
  name: string;
  scope: 'user' | 'project';
  path: string;
  description?: string;
  lastModified: string;
  content?: string;
  type?: 'skill' | 'rule'; // 区分 skill 和 rule
}

export interface SkillHistory {
  id: string;
  skillName: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp: string;
  diff?: string;
}

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

// ============ Crawler 类型 ============

export interface CrawlTopicProgress {
  topic: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  reposSearched: number;
  proposalsGenerated: number;
  errors: string[];
}

export interface CrawlJobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  config: { topics: string[]; minStars: number; maxRepos?: number };
  topics: CrawlTopicProgress[];
  overall: {
    reposSearched: number;
    reposWithSkills: number;
    skillsFound: number;
    proposalsGenerated: number;
    errors: { repo?: string; message: string; timestamp: string }[];
  };
}

export interface CrawlRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed';
  reposScanned: number;
  proposalsCreated: number;
  error?: string;
}

export interface CachedRepo {
  name: string;
  stars: number;
  lastCrawled: string;
  skillsFound: number;
}

// ============ Admin 类型 ============

export interface AdminStatus {
  mode: AdminMode;
  isOnline: boolean;
  lastActive: string;
  pendingProposals: number;
  tokenEstimate: number;
  nextWakeAt?: string;
}

export interface WakeHistory {
  id: string;
  triggeredAt: string;
  trigger: 'scheduled' | 'manual' | 'proposal';
  result: 'success' | 'failed';
  proposalsProcessed: number;
}

// ============ Scheduler 类型 ============

export interface SchedulerStatus {
  crawl: {
    enabled: boolean;
    nextRun: string | null;
    lastRun: string | null;
  };
  wake: {
    enabled: boolean;
    nextRun: string | null;
    lastRun: string | null;
  };
}

// ============ Merge 类型 ============

export interface MergeFileCounts {
  proposals: number;
  decisions: number;
  history: number;
  total: number;
}

export interface MergeResult {
  success: boolean;
  proposals?: {
    merged: number;
    archived: number;
    active: number;
  };
  decisions?: {
    merged: number;
    archived: number;
  };
  history?: {
    merged: number;
    archived: number;
  };
  error?: string;
}

export interface MergeRecord {
  timestamp: string;
  triggered: boolean;
  reason: string;
  result?: MergeResult;
  fileCounts: MergeFileCounts;
  error?: string;
}

export interface MergeStatus {
  active: boolean;
  enabled: boolean;
  nextRun: string | null;
  lastRun: string | null;
  schedule: string;
  lastRecord: MergeRecord | null;
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

// ============ Dashboard 统计 ============

export interface DashboardStats {
  skillsCount: {
    user: number;
    project: number;
    total: number;
  };
  proposalsCount: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  recentDecisions: Decision[];
  adminStatus: AdminStatus;
  schedulerStatus: SchedulerStatus;
}
