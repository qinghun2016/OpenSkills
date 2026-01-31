/**
 * OpenSkills API Client
 */

import type {
  ApiResponse,
  PaginatedResponse,
  Config,
  Preferences,
  PreferencesHistoryEntry,
  Proposal,
  ProposalSummary,
  ProposalStatus,
  ProposalScope,
  ProposalTrigger,
  ProposalCreateInput,
  Decision,
  Skill,
  CrawlRun,
  CrawlJobStatus,
  CachedRepo,
  AdminStatus,
  WakeHistory,
  SchedulerStatus,
  DashboardStats,
  MergeRecord,
  MergeStatus,
} from './types';

const API_BASE = '/api';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json; charset=utf-8',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  }

  // ============ Config ============

  async getConfig(): Promise<Config> {
    const res = await this.request<ApiResponse<{ merged: Config; sources: unknown }>>('/config');
    // API 返回 { merged: Config, sources: {...} }，我们只需要 merged 配置
    return res.data?.merged || res.data as unknown as Config;
  }

  async updateConfig(updates: Partial<Config>): Promise<Config> {
    const res = await this.request<ApiResponse<Config>>('/config', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.data!;
  }

  // ============ Preferences ============

  async getPreferences(): Promise<Preferences> {
    const res = await this.request<ApiResponse<{ merged: Preferences; sources: unknown }>>('/preferences');
    // API 返回 { merged: Preferences, sources: {...} }，我们只需要 merged 配置
    return res.data?.merged || res.data as unknown as Preferences;
  }

  async updatePreferences(updates: Partial<Preferences>): Promise<Preferences> {
    const res = await this.request<ApiResponse<Preferences>>('/preferences', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.data!;
  }

  async getPreferencesHistory(): Promise<PreferencesHistoryEntry[]> {
    const res = await this.request<ApiResponse<PreferencesHistoryEntry[]>>('/preferences/history');
    return res.data || [];
  }

  async rollbackPreferences(historyId: string): Promise<Preferences> {
    const res = await this.request<ApiResponse<Preferences>>(`/preferences/rollback/${historyId}`, {
      method: 'POST',
    });
    return res.data!;
  }

  // ============ Proposals ============

  async getProposals(params?: {
    status?: ProposalStatus;
    scope?: ProposalScope;
    trigger?: ProposalTrigger;
    limit?: number;
    summary?: boolean;
  }): Promise<ProposalSummary[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.scope) searchParams.set('scope', params.scope);
    if (params?.trigger) searchParams.set('trigger', params.trigger);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.summary) searchParams.set('summary', 'true');

    const query = searchParams.toString();
    const res = await this.request<PaginatedResponse<ProposalSummary>>(
      `/proposals${query ? `?${query}` : ''}`
    );
    return res.data;
  }

  async getProposal(id: string): Promise<Proposal> {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.ts:117',message:'getProposal called',data:{id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const res = await this.request<ApiResponse<Proposal>>(`/proposals/${id}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.ts:119',message:'getProposal response',data:{hasData:!!res.data,dataKeys:res.data?Object.keys(res.data):null,proposerMetaExists:!!res.data?.proposerMeta},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion
    return res.data!;
  }

  async approveProposal(id: string, reason?: string): Promise<Decision> {
    const res = await this.request<ApiResponse<Decision>>(`/proposals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data!;
  }

  async rejectProposal(id: string, reason: string): Promise<Decision> {
    const res = await this.request<ApiResponse<Decision>>(`/proposals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data!;
  }

  /** 创建提议（用户/Agent/Crawler）。格式校验通过后由后端写入。 */
  async createProposal(input: ProposalCreateInput): Promise<Proposal> {
    const res = await this.request<ApiResponse<Proposal>>('/proposals', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data!;
  }

  // ============ Decisions ============

  async getDecisions(params?: { limit?: number; search?: string }): Promise<Decision[]> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    const res = await this.request<PaginatedResponse<Decision>>(`/decisions${query ? `?${query}` : ''}`);
    return res.data;
  }

  async getDecision(id: string): Promise<Decision> {
    const res = await this.request<ApiResponse<Decision>>(`/decisions/${id}`);
    return res.data!;
  }

  /** 应用已批准的决策（将 diff 写入 SKILL 文件） */
  async applyDecision(proposalId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const res = await this.request<ApiResponse<unknown>>(`/decisions/${proposalId}/apply`, {
      method: 'POST',
    });
    return { success: true, data: res.data };
  }

  // ============ Skills ============

  async getSkills(scope?: 'user' | 'project'): Promise<Skill[]> {
    const query = scope ? `?scope=${scope}` : '';
    const res = await this.request<ApiResponse<Skill[]>>(`/skills${query}`);
    return res.data || [];
  }

  async getSkill(name: string, scope: 'user' | 'project'): Promise<Skill> {
    const res = await this.request<ApiResponse<Skill>>(`/skills/${scope}/${name}`);
    return res.data!;
  }

  /** 新增一条用户规则（Cursor 全局用户规则） */
  async addUserRule(content: string, description?: string): Promise<{ index: number; name: string }> {
    const res = await this.request<ApiResponse<{ index: number; name: string; exported: number }>>('/cursor-rules', {
      method: 'POST',
      body: JSON.stringify({ content, description }),
    });
    return { index: res.data!.index, name: res.data!.name };
  }

  /** 更新一条用户规则 */
  async updateUserRule(index: number, content: string, description?: string): Promise<void> {
    await this.request<ApiResponse<{ index: number; name: string; exported: number }>>(`/cursor-rules/${index}`, {
      method: 'PUT',
      body: JSON.stringify({ content, description }),
    });
  }

  /** 删除一条用户规则 */
  async deleteUserRule(index: number): Promise<void> {
    await this.request<ApiResponse<{ deleted: number; remaining: number }>>(`/cursor-rules/${index}`, {
      method: 'DELETE',
    });
  }

  // ============ Crawler ============

  async getCrawlerRuns(): Promise<CrawlRun[]> {
    const res = await this.request<ApiResponse<CrawlRun[]>>('/crawler/runs');
    return res.data || [];
  }

  async getCachedRepos(): Promise<CachedRepo[]> {
    const res = await this.request<ApiResponse<CachedRepo[]>>('/crawler/repos');
    return res.data || [];
  }

  async triggerCrawl(): Promise<{ jobId: string }> {
    const res = await this.request<ApiResponse<{ jobId: string }>>('/crawler/trigger', {
      method: 'POST',
    });
    return res.data!;
  }

  async getCrawlJobStatus(jobId: string): Promise<CrawlJobStatus> {
    const res = await this.request<ApiResponse<CrawlJobStatus>>(`/crawler/jobs/${jobId}`);
    return res.data!;
  }

  // ============ Scheduler ============

  async getSchedulerStatus(): Promise<SchedulerStatus> {
    const res = await this.request<ApiResponse<SchedulerStatus>>('/scheduler/status');
    return res.data!;
  }

  async triggerWake(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/scheduler/wake/trigger', {
      method: 'POST',
    });
  }

  // ============ Admin ============

  async getAdminStatus(): Promise<AdminStatus> {
    const res = await this.request<ApiResponse<AdminStatus>>('/admin/status');
    return res.data!;
  }

  async getWakeHistory(): Promise<WakeHistory[]> {
    const res = await this.request<ApiResponse<WakeHistory[]>>('/admin/wake-history');
    return res.data || [];
  }

  // ============ Merge ============

  async triggerMerge(): Promise<MergeRecord> {
    const res = await this.request<ApiResponse<MergeRecord>>('/scheduler/merge/trigger', {
      method: 'POST',
    });
    return res.data!;
  }

  async getMergeStatus(): Promise<MergeStatus> {
    const res = await this.request<ApiResponse<MergeStatus>>('/scheduler/merge/status');
    return res.data!;
  }

  async getMergeHistory(limit = 50): Promise<MergeRecord[]> {
    const res = await this.request<ApiResponse<MergeRecord[]>>(
      `/scheduler/merge/history?limit=${limit}`
    );
    return res.data || [];
  }

  // ============ Dashboard ============

  async getDashboardStats(): Promise<DashboardStats> {
    const res = await this.request<ApiResponse<DashboardStats>>('/dashboard/stats');
    return res.data!;
  }
}

export const api = new ApiClient();
export * from './types';
