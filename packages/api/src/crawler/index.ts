/**
 * Crawler 入口 - 执行 GitHub Skills 仓库爬取
 */

import * as fs from 'fs';
import * as path from 'path';
import { createGitHubClient, GitHubClient, RepoSearchResult } from './githubClient';
import { createSkillsParser, SkillsParser, RepoSkills } from './skillsParser';
import { createProposalGenerator, ProposalGenerator, GeneratedProposal, ExistingSkill } from './proposalGenerator';
import { OpenSkillsConfig, Proposal, ProposalScope } from '../types';
import { readAllFromArchives, findEntryInArchives } from '../utils/archiveReader';

export interface CrawlConfig {
  enabled: boolean;
  topics: string[];
  minStars: number;
  githubToken?: string;
  maxRepos?: number;
}

export interface CrawlRunResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  config: CrawlConfig;
  reposSearched: number;
  reposWithSkills: number;
  skillsFound: number;
  proposalsGenerated: number;
  errors: CrawlError[];
}

export interface CrawlError {
  repo?: string;
  message: string;
  timestamp: string;
}

export interface CrawlRunRecord {
  runId: string;
  startedAt: string;
  completedAt: string;
  config: CrawlConfig;
  stats: {
    reposSearched: number;
    reposWithSkills: number;
    skillsFound: number;
    proposalsGenerated: number;
  };
  errors: CrawlError[];
  proposals: string[]; // proposal IDs
}

// 路径常量
const OPENSKILLS_DIR = '.openskills';
const CRAWLED_DIR = `${OPENSKILLS_DIR}/crawled`;
const RUNS_DIR = `${CRAWLED_DIR}/runs`;
const REPOS_DIR = `${CRAWLED_DIR}/repos`;
const PROPOSALS_DIR = `${OPENSKILLS_DIR}/proposals`;

/**
 * 生成唯一运行 ID
 */
function generateRunId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const random = Math.random().toString(36).slice(2, 6);
  return `crawl-${timestamp}-${random}`;
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 读取现有 Skills (从项目和用户级目录)
 */
function loadExistingSkills(workspaceRoot: string): ExistingSkill[] {
  const skills: ExistingSkill[] = [];

  // 项目级 skills
  const projectSkillsDir = path.join(workspaceRoot, '.cursor', 'skills');
  if (fs.existsSync(projectSkillsDir)) {
    const entries = fs.readdirSync(projectSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(projectSkillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          skills.push({
            name: entry.name,
            path: skillPath,
            content: fs.readFileSync(skillPath, 'utf-8'),
            scope: 'project',
          });
        }
      }
    }
  }

  return skills;
}

/**
 * 保存仓库缓存
 */
function saveRepoCache(workspaceRoot: string, repoSkills: RepoSkills): void {
  const reposDir = path.join(workspaceRoot, REPOS_DIR);
  ensureDir(reposDir);

  const fileName = `${repoSkills.owner}_${repoSkills.repo}.json`;
  const filePath = path.join(reposDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(repoSkills, null, 2), 'utf-8');
}

/**
 * 保存提案文件
 */
function saveProposal(workspaceRoot: string, proposal: Proposal): void {
  const proposalsDir = path.join(workspaceRoot, PROPOSALS_DIR);
  ensureDir(proposalsDir);

  const filePath = path.join(proposalsDir, `${proposal.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2), 'utf-8');
}

/**
 * 保存运行记录
 */
function saveRunRecord(workspaceRoot: string, record: CrawlRunRecord): void {
  const runsDir = path.join(workspaceRoot, RUNS_DIR);
  ensureDir(runsDir);

  const filePath = path.join(runsDir, `${record.runId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
}

/**
 * 读取运行记录列表
 * 从以下位置读取：
 * 1. crawler/runs/ (向后兼容)
 * 2. crawler/runs/archived/ (合并后的归档文件)
 */
export async function listCrawlRuns(workspaceRoot: string): Promise<CrawlRunRecord[]> {
  // 定义要读取的目录（按优先级顺序）
  // readAllFromArchives 会自动从 archived/ 子目录读取
  const runsDir = path.join(workspaceRoot, RUNS_DIR);
  const dirs = [runsDir];

  // 从所有目录读取（包括归档文件）
  const allRecords = await readAllFromArchives<CrawlRunRecord>(dirs);

  // 按时间降序排列
  return allRecords.sort((a, b) => 
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

/**
 * 获取单个运行记录
 * 按以下顺序查找：
 * 1. crawler/runs/ 目录（向后兼容）
 * 2. crawler/runs/archived/ 归档文件
 */
export async function getCrawlRun(workspaceRoot: string, runId: string): Promise<CrawlRunRecord | null> {
  const runsDir = path.join(workspaceRoot, RUNS_DIR);
  
  // 1. 先检查 runs/ 目录（向后兼容）
  // 文件名可能是 runId.json 或 crawl-*.json 格式
  const possiblePaths = [
    path.join(runsDir, `${runId}.json`),
    path.join(runsDir, `crawl-${runId}.json`),
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const record = JSON.parse(content);
        // 验证 runId 匹配
        if (record.runId === runId) {
          return record;
        }
      } catch (error) {
        // 继续查找下一个可能的路径
      }
    }
  }

  // 2. 从归档文件中查找（包括 archived/ 子目录）
  const dirs = [runsDir];
  const record = await findEntryInArchives<CrawlRunRecord>(dirs, 'runId', runId);
  
  return record;
}

/**
 * 读取已缓存的仓库列表
 */
export function listCachedRepos(workspaceRoot: string): RepoSkills[] {
  const reposDir = path.join(workspaceRoot, REPOS_DIR);
  
  if (!fs.existsSync(reposDir)) {
    return [];
  }

  const files = fs.readdirSync(reposDir).filter(f => f.endsWith('.json'));
  const repos: RepoSkills[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(reposDir, file), 'utf-8');
      repos.push(JSON.parse(content));
    } catch (error) {
      // 跳过无效文件
    }
  }

  return repos.sort((a, b) => b.stars - a.stars);
}

export class Crawler {
  private client: GitHubClient;
  private parser: SkillsParser;
  private generator: ProposalGenerator;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, token?: string) {
    this.workspaceRoot = workspaceRoot;
    this.client = createGitHubClient(token);
    this.parser = createSkillsParser(this.client);
    this.generator = createProposalGenerator({ defaultScope: 'project' });
  }

  /**
   * 执行一次完整爬取
   */
  async runCrawl(config: CrawlConfig): Promise<CrawlRunResult> {
    const runId = generateRunId();
    const startedAt = new Date().toISOString();
    const errors: CrawlError[] = [];
    const proposalIds: string[] = [];

    let reposSearched = 0;
    let reposWithSkills = 0;
    let skillsFound = 0;
    let proposalsGenerated = 0;

    // 确保目录结构存在
    ensureDir(path.join(this.workspaceRoot, RUNS_DIR));
    ensureDir(path.join(this.workspaceRoot, REPOS_DIR));
    ensureDir(path.join(this.workspaceRoot, PROPOSALS_DIR));

    try {
      // 1. 检查 API 限流
      const hasQuota = await this.client.checkRateLimit(10);
      if (!hasQuota) {
        throw new Error('Insufficient GitHub API quota');
      }

      // 2. 搜索仓库
      const repos = await this.client.searchRepos(
        config.topics,
        config.minStars,
        config.maxRepos || 30
      );
      reposSearched = repos.length;

      // 3. 加载现有 Skills
      const existingSkills = loadExistingSkills(this.workspaceRoot);

      // 4. 遍历仓库，解析 Skills
      for (const repo of repos) {
        try {
          const repoSkills = await this.parser.getRepoSkills(
            repo.owner,
            repo.repo,
            repo.stars
          );

          if (repoSkills.skills.length > 0) {
            reposWithSkills++;
            skillsFound += repoSkills.skills.length;

            // 缓存仓库信息
            saveRepoCache(this.workspaceRoot, repoSkills);

            // 生成提案
            const proposals = this.generator.generateProposals(repoSkills, existingSkills);
            
            for (const proposal of proposals) {
              const proposalFile = this.generator.toProposalFile(proposal);
              saveProposal(this.workspaceRoot, proposalFile);
              proposalIds.push(proposal.id);
              proposalsGenerated++;
            }
          }
        } catch (error: any) {
          errors.push({
            repo: repo.fullName,
            message: error.message || 'Unknown error',
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error: any) {
      errors.push({
        message: error.message || 'Crawl failed',
        timestamp: new Date().toISOString(),
      });
    }

    const completedAt = new Date().toISOString();

    // 保存运行记录
    const runRecord: CrawlRunRecord = {
      runId,
      startedAt,
      completedAt,
      config,
      stats: {
        reposSearched,
        reposWithSkills,
        skillsFound,
        proposalsGenerated,
      },
      errors,
      proposals: proposalIds,
    };

    saveRunRecord(this.workspaceRoot, runRecord);

    return {
      runId,
      startedAt,
      completedAt,
      config,
      reposSearched,
      reposWithSkills,
      skillsFound,
      proposalsGenerated,
      errors,
    };
  }

  /**
   * 获取 GitHub 客户端状态
   */
  async getStatus(): Promise<{
    tokenStatus: { hasToken: boolean; rateLimit: string };
    rateLimit: { limit: number; remaining: number; reset: Date };
  }> {
    const tokenStatus = this.client.getTokenStatus();
    const rateLimit = await this.client.getRateLimit();
    return { tokenStatus, rateLimit };
  }
}

/**
 * 从配置文件运行爬取
 */
export async function runCrawlFromConfig(workspaceRoot: string): Promise<CrawlRunResult> {
  const configPath = path.join(workspaceRoot, OPENSKILLS_DIR, 'config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error('OpenSkills config not found');
  }

  const config: OpenSkillsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  
  if (!config.crawl.enabled) {
    throw new Error('Crawl is disabled in config');
  }

  // Prefer env token, then config token
  const githubToken = process.env.GITHUB_TOKEN || config.crawl.githubToken || undefined;
  const raw = Array.isArray(config.crawl.topics) ? config.crawl.topics : [];
  const normalized = raw.map((t) => (typeof t === 'string' ? t.trim() : '')).filter((t) => t.length > 0);
  const effectiveTopics = normalized.length > 0 ? normalized : ['cursor-skills'];

  const crawler = new Crawler(workspaceRoot, githubToken);
  return crawler.runCrawl({
    enabled: config.crawl.enabled,
    topics: effectiveTopics,
    minStars: config.crawl.minStars ?? 100,
    githubToken: githubToken,
  });
}

// 导出子模块
export { GitHubClient, createGitHubClient } from './githubClient';
export { SkillsParser, createSkillsParser, ParsedSkill, RepoSkills } from './skillsParser';
export { ProposalGenerator, createProposalGenerator, GeneratedProposal } from './proposalGenerator';
