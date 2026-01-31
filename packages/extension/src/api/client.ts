/**
 * OpenSkills API 客户端
 * 连接可配置端口的 API 服务（默认 3847）；若内嵌服务使用了换端口，则优先使用实际端口
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { getActualApiPort } from '../servers/embeddedServers';
import {
  Proposal,
  ProposalSummary,
  Config,
  Decision,
  ApiResponse,
  PaginatedResponse,
  ProposalStatus,
  ProposalScope
} from '../types';

export class ApiClient {
  private baseUrl: string;
  private available: boolean = false;

  constructor() {
    this.baseUrl = this.getApiUrl();
  }

  /**
   * 获取 API URL：优先 apiUrl 配置，其次内嵌服务实际端口，最后 apiPort 配置（默认 3847）
   */
  private getApiUrl(): string {
    const config = vscode.workspace.getConfiguration('openskills');
    const url = config.get<string>('apiUrl');
    if (url && url.trim() !== '') {
      return url.trim();
    }
    const actualPort = getActualApiPort();
    if (actualPort != null) {
      return `http://localhost:${actualPort}`;
    }
    const port = config.get<number>('apiPort') ?? 3847;
    return `http://localhost:${port}`;
  }

  /**
   * 更新 API URL
   */
  public updateBaseUrl(): void {
    this.baseUrl = this.getApiUrl();
  }

  /**
   * 检查 API 服务是否可用
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const response = await this.request<{ status: string }>('GET', '/health');
      this.available = response.success;
      return this.available;
    } catch (error) {
      this.available = false;
      // 错误信息已在 request 方法中处理，这里只返回 false
      return false;
    }
  }

  /**
   * 获取 API 是否可用
   */
  public isAvailable(): boolean {
    return this.available;
  }

  /**
   * 获取 API base URL（供外部使用）
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * 发送 HTTP 请求
   */
  private request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 5000
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (parseError) {
            const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
            resolve({ 
              success: false, 
              error: `无效的 JSON 响应: ${parseMsg}。API 可能返回了非 JSON 格式的数据。` 
            });
          }
        });
      });

      req.on('error', (err) => {
        const errorMessage = err.message || String(err);
        let detailedError = `API 请求失败: ${errorMessage}`;
        
        // 提供更详细的错误信息
        if (errorMessage.includes('ECONNREFUSED')) {
          detailedError = `API 连接被拒绝: ${this.baseUrl}。请确保 API 服务正在运行。`;
        } else if (errorMessage.includes('ENOTFOUND')) {
          detailedError = `API 主机未找到: ${this.baseUrl}。请检查 API URL 配置。`;
        } else if (errorMessage.includes('ETIMEDOUT')) {
          detailedError = `API 请求超时: ${this.baseUrl}。请检查网络连接。`;
        }
        
        reject(new Error(detailedError));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`API 请求超时: ${this.baseUrl}。请检查 API 服务是否正常运行或网络连接是否正常。`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // ============ Proposals API ============

  /**
   * 获取所有 proposals
   */
  public async getProposals(params?: {
    status?: ProposalStatus;
    scope?: ProposalScope;
    limit?: number;
    summary?: boolean;
  }): Promise<PaginatedResponse<Proposal | ProposalSummary>> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.summary) query.set('summary', 'true');
    
    const path = `/api/proposals${query.toString() ? '?' + query.toString() : ''}`;
    const response = await this.request<Proposal[] | ProposalSummary[]>('GET', path);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data,
        total: response.data.length,
        limit: params?.limit || 100
      };
    }
    
    return {
      success: false,
      data: [],
      total: 0,
      limit: params?.limit || 100,
      error: response.error
    };
  }

  /**
   * 获取单个 proposal
   */
  public async getProposal(id: string): Promise<ApiResponse<Proposal>> {
    return this.request<Proposal>('GET', `/api/proposals/${id}`);
  }

  /**
   * 批准 proposal
   */
  public async approveProposal(id: string, reason?: string): Promise<ApiResponse<Decision>> {
    return this.request<Decision>('POST', `/api/proposals/${id}/approve`, { reason });
  }

  /**
   * 拒绝 proposal
   */
  public async rejectProposal(id: string, reason: string): Promise<ApiResponse<Decision>> {
    return this.request<Decision>('POST', `/api/proposals/${id}/reject`, { reason });
  }

  /**
   * 删除 proposal（用于应用失败、无法操作时由 skills-admin 清理）
   */
  public async deleteProposal(id: string): Promise<ApiResponse<{ message?: string }>> {
    return this.request<{ message?: string }>('DELETE', `/api/proposals/${encodeURIComponent(id)}`);
  }

  // ============ Config API ============

  /**
   * 获取配置
   * API 返回 { merged, sources }，此处解包为 merged 以保持一致
   */
  public async getConfig(): Promise<ApiResponse<Config>> {
    const res = await this.request<Config | { merged: Config; sources: unknown }>('GET', '/api/config');
    if (!res.success || !res.data) {
      return { success: res.success, data: res.data as Config | undefined, error: res.error };
    }
    const d = res.data as { merged?: Config };
    return { success: true, data: d.merged ?? (res.data as Config) };
  }

  /**
   * 更新配置
   */
  public async updateConfig(config: Partial<Config>): Promise<ApiResponse<Config>> {
    return this.request<Config>('PATCH', '/api/config', config);
  }

  // ============ Scheduler API ============

  /**
   * 触发唤醒
   */
  public async triggerWake(): Promise<ApiResponse<{ triggered: boolean }>> {
    return this.request<{ triggered: boolean }>('POST', '/api/scheduler/wake/trigger');
  }

  /**
   * 获取调度器状态
   */
  public async getSchedulerStatus(): Promise<ApiResponse<{
    wake: { enabled: boolean; nextRun: string | null };
    crawl: { enabled: boolean; nextRun: string | null };
  }>> {
    return this.request('GET', '/api/scheduler/status');
  }

  /**
   * 手动触发合并（历史/提案/决策等文件在服务端合并与归档，避免本地文件操作触发用户确认）
   */
  public async triggerMerge(): Promise<ApiResponse<{ success: boolean; data?: unknown }>> {
    return this.request('POST', '/api/scheduler/merge/trigger');
  }

  // ============ Decisions API ============

  /**
   * 应用已批准的决策（将 diff 应用到目标 SKILL.md）
   * 用于在未自动应用时单独触发，避免 Agent 直接写文件触发用户确认
   */
  public async applyDecision(proposalId: string): Promise<ApiResponse<{ success: boolean; historyId?: string }>> {
    return this.request<{ success: boolean; historyId?: string }>(
      'POST',
      `/api/decisions/${encodeURIComponent(proposalId)}/apply`
    );
  }

  /**
   * 获取决策历史
   */
  public async getDecisions(params?: {
    limit?: number;
  }): Promise<PaginatedResponse<Decision>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    
    const path = `/api/decisions${query.toString() ? '?' + query.toString() : ''}`;
    const response = await this.request<Decision[]>('GET', path);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data,
        total: response.data.length,
        limit: params?.limit || 100
      };
    }
    
    return {
      success: false,
      data: [],
      total: 0,
      limit: params?.limit || 100,
      error: response.error
    };
  }
}

// 单例实例
let apiClientInstance: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new ApiClient();
  }
  return apiClientInstance;
}

export function disposeApiClient(): void {
  apiClientInstance = null;
}
