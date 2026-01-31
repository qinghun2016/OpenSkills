/**
 * GitHub API Client - Octokit 封装
 * 支持可选 token，遵守 API 限流
 */

import { Octokit } from '@octokit/rest';

export interface RepoSearchResult {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  stars: number;
  topics: string[];
  url: string;
  defaultBranch: string;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  encoding: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

export class GitHubClient {
  private octokit: Octokit;
  private hasToken: boolean;

  constructor(token?: string) {
    this.hasToken = !!token;
    this.octokit = new Octokit({
      auth: token || undefined,
      userAgent: 'OpenSkills-Crawler/1.0',
    });
  }

  /**
   * 获取当前 API 限流状态
   * 无 token: 60 requests/hour
   * 有 token: 5000 requests/hour
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    const { data } = await this.octokit.rateLimit.get();
    return {
      limit: data.rate.limit,
      remaining: data.rate.remaining,
      reset: new Date(data.rate.reset * 1000),
    };
  }

  /**
   * 检查是否有足够的 API 配额
   * @param required 需要的请求数
   */
  async checkRateLimit(required: number = 1): Promise<boolean> {
    const limit = await this.getRateLimit();
    return limit.remaining >= required;
  }

  /**
   * Search repos by topics and minStars.
   * For each term: (1) topic:term and (2) term in:name, then merge. So repos without the topic but with the name (e.g. andrej-karpathy-skills, AI-research-SKILLs) are found.
   */
  async searchRepos(
    topics: string[],
    minStars: number,
    maxResults: number = 30
  ): Promise<RepoSearchResult[]> {
    const raw = Array.isArray(topics) ? topics : [];
    const effectiveTopics = raw
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t) => t.length > 0);
    const terms = effectiveTopics.length > 0 ? effectiveTopics : ['cursor-skills'];

    const byFullName = new Map<string, RepoSearchResult>();
    const perQuery = Math.min(Math.max(10, Math.ceil(maxResults / (terms.length * 2))), 100);

    const runQuery = async (q: string): Promise<void> => {
      const response = await this.octokit.search.repos({
        q: q + ` stars:>=${minStars}`,
        sort: 'stars',
        order: 'desc',
        per_page: perQuery,
      });
      for (const repo of response.data.items) {
        const fullName = repo.full_name;
        if (!byFullName.has(fullName)) {
          byFullName.set(fullName, {
            owner: repo.owner?.login || '',
            repo: repo.name,
            fullName,
            description: repo.description,
            stars: repo.stargazers_count,
            topics: repo.topics || [],
            url: repo.html_url,
            defaultBranch: repo.default_branch,
          });
        }
      }
    };

    for (const topic of terms) {
      try {
        await runQuery(`topic:${topic}`);
        await runQuery(`${topic} in:name`);
      } catch (error) {
        if (this.isRateLimitError(error)) {
          throw new Error('GitHub API rate limit exceeded. Please wait or provide a token.');
        }
        throw error;
      }
    }

    return Array.from(byFullName.values()).sort((a, b) => b.stars - a.stars).slice(0, maxResults);
  }

  /**
   * 获取仓库文件内容
   * @param owner 仓库所有者
   * @param repo 仓库名
   * @param path 文件路径
   */
  async getRepoContent(
    owner: string,
    repo: string,
    path: string
  ): Promise<FileContent | null> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
      });

      // GitHub API 返回单个文件时是对象，目录时是数组
      const data = response.data;
      
      if (Array.isArray(data)) {
        // 这是一个目录，不是文件
        return null;
      }

      if (data.type !== 'file' || !('content' in data)) {
        return null;
      }

      // 解码 base64 内容
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      
      return {
        path: data.path,
        content,
        sha: data.sha,
        encoding: data.encoding,
      };
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      if (this.isRateLimitError(error)) {
        throw new Error('GitHub API rate limit exceeded.');
      }
      throw error;
    }
  }

  /**
   * 获取目录内容列表
   * @param owner 仓库所有者
   * @param repo 仓库名
   * @param path 目录路径
   */
  async getDirectoryContents(
    owner: string,
    repo: string,
    path: string
  ): Promise<string[]> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
      });

      const data = response.data;
      
      if (!Array.isArray(data)) {
        return [];
      }

      return data.map(item => item.path);
    } catch (error: any) {
      if (error.status === 404) {
        return [];
      }
      if (this.isRateLimitError(error)) {
        throw new Error('GitHub API rate limit exceeded.');
      }
      throw error;
    }
  }

  /**
   * 检查仓库是否存在指定文件
   */
  async fileExists(owner: string, repo: string, path: string): Promise<boolean> {
    const content = await this.getRepoContent(owner, repo, path);
    return content !== null;
  }

  /**
   * 获取 token 状态信息
   */
  getTokenStatus(): { hasToken: boolean; rateLimit: string } {
    return {
      hasToken: this.hasToken,
      rateLimit: this.hasToken ? '5000/hour' : '60/hour',
    };
  }

  private isRateLimitError(error: any): boolean {
    return (
      error.status === 403 &&
      error.response?.headers?.['x-ratelimit-remaining'] === '0'
    );
  }
}

// 工厂函数 - 从配置创建客户端
export function createGitHubClient(token?: string): GitHubClient {
  return new GitHubClient(token);
}
