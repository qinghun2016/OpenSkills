/**
 * React Query hooks for API data fetching
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type {
  Config,
  Preferences,
  ProposalStatus,
  ProposalScope,
  ProposalCreateInput,
} from '@/api/types';

// ============ Query Keys ============

export const queryKeys = {
  config: ['config'] as const,
  preferences: ['preferences'] as const,
  preferencesHistory: ['preferences', 'history'] as const,
  proposals: (params?: { status?: ProposalStatus; scope?: ProposalScope }) =>
    ['proposals', params] as const,
  proposal: (id: string) => ['proposals', id] as const,
  decisions: ['decisions'] as const,
  decision: (id: string) => ['decisions', id] as const,
  skills: (scope?: 'user' | 'project') => ['skills', scope] as const,
  skill: (name: string, scope: 'user' | 'project') =>
    ['skills', scope, name] as const,
  crawlerRuns: ['crawler', 'runs'] as const,
  cachedRepos: ['crawler', 'repos'] as const,
  schedulerStatus: ['scheduler', 'status'] as const,
  adminStatus: ['admin', 'status'] as const,
  wakeHistory: ['admin', 'wake-history'] as const,
  dashboardStats: ['dashboard', 'stats'] as const,
  mergeStatus: ['merge', 'status'] as const,
  mergeHistory: ['merge', 'history'] as const,
};

// ============ Config Hooks ============

export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => api.getConfig(),
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Config>) => api.updateConfig(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
  });
}

// ============ Preferences Hooks ============

export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => api.getPreferences(),
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Preferences>) => api.updatePreferences(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences });
    },
  });
}

export function usePreferencesHistory() {
  return useQuery({
    queryKey: queryKeys.preferencesHistory,
    queryFn: () => api.getPreferencesHistory(),
  });
}

export function useRollbackPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (historyId: string) => api.rollbackPreferences(historyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.preferences });
      queryClient.invalidateQueries({ queryKey: queryKeys.preferencesHistory });
    },
  });
}

// ============ Proposals Hooks ============

export function useProposals(params?: {
  status?: ProposalStatus;
  scope?: ProposalScope;
  limit?: number;
}) {
  return useQuery({
    queryKey: queryKeys.proposals(params),
    queryFn: () => api.getProposals({ ...params, summary: true }),
  });
}

export function useProposal(id: string) {
  return useQuery({
    queryKey: queryKeys.proposal(id),
    queryFn: () => api.getProposal(id),
    enabled: !!id,
  });
}

export function useApproveProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.approveProposal(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.decisions });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
      // 刷新 skills 列表，确保显示最新内容（proposal 应用后会更新 skill 文件）
      queryClient.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}

export function useRejectProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.rejectProposal(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.decisions });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useCreateProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProposalCreateInput) => api.createProposal(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useApplyDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => api.applyDecision(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.decisions });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}

// ============ Decisions Hooks ============

export function useDecisions(params?: { limit?: number; search?: string }) {
  return useQuery({
    queryKey: [...queryKeys.decisions, params],
    queryFn: () => api.getDecisions(params),
  });
}

export function useDecision(id: string) {
  return useQuery({
    queryKey: queryKeys.decision(id),
    queryFn: () => api.getDecision(id),
    enabled: !!id,
  });
}

// ============ Skills Hooks ============

export function useSkills(scope?: 'user' | 'project') {
  return useQuery({
    queryKey: queryKeys.skills(scope),
    queryFn: () => api.getSkills(scope),
    staleTime: 0, // 总是认为数据是过时的，确保获取最新数据
    refetchOnMount: true, // 组件挂载时重新获取
    refetchOnWindowFocus: true, // 窗口聚焦时重新获取
  });
}

export function useSkill(name: string, scope: 'user' | 'project') {
  return useQuery({
    queryKey: queryKeys.skill(name, scope),
    queryFn: () => api.getSkill(name, scope),
    enabled: !!name && !!scope,
    staleTime: 0, // 总是认为数据是过时的，确保获取最新数据
    refetchOnMount: true, // 组件挂载时重新获取
  });
}

// ============ Crawler Hooks ============

export function useCrawlerRuns() {
  return useQuery({
    queryKey: queryKeys.crawlerRuns,
    queryFn: () => api.getCrawlerRuns(),
  });
}

export function useCachedRepos() {
  return useQuery({
    queryKey: queryKeys.cachedRepos,
    queryFn: () => api.getCachedRepos(),
  });
}

export function useTriggerCrawl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.triggerCrawl(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.crawlerRuns });
    },
  });
}

// ============ Scheduler Hooks ============

export function useSchedulerStatus() {
  return useQuery({
    queryKey: queryKeys.schedulerStatus,
    queryFn: () => api.getSchedulerStatus(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useTriggerWake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.triggerWake(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedulerStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.wakeHistory });
    },
  });
}

// ============ Admin Hooks ============

export function useAdminStatus() {
  return useQuery({
    queryKey: queryKeys.adminStatus,
    queryFn: () => api.getAdminStatus(),
    refetchInterval: 30000,
  });
}

export function useWakeHistory() {
  return useQuery({
    queryKey: queryKeys.wakeHistory,
    queryFn: () => api.getWakeHistory(),
  });
}

// ============ Merge Hooks ============

export function useMergeStatus() {
  return useQuery({
    queryKey: queryKeys.mergeStatus,
    queryFn: () => api.getMergeStatus(),
    refetchInterval: 30000,
  });
}

export function useMergeHistory(limit = 50) {
  return useQuery({
    queryKey: [...queryKeys.mergeHistory, limit],
    queryFn: () => api.getMergeHistory(limit),
  });
}

// ============ Merge Actions ============

export function useTriggerMerge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.triggerMerge(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mergeStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.mergeHistory });
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals() });
      queryClient.invalidateQueries({ queryKey: queryKeys.decisions });
    },
  });
}

// ============ Dashboard Hooks ============

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: () => api.getDashboardStats(),
    refetchInterval: 60000, // Refresh every minute
  });
}
