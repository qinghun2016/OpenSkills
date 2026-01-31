/**
 * Crawler API Routes
 * 
 * Endpoints:
 * - GET  /api/crawler/runs         - 爬取运行记录列表
 * - GET  /api/crawler/runs/:runId  - 运行详情
 * - GET  /api/crawler/repos        - 已缓存的仓库列表
 * - POST /api/crawler/trigger      - 手动触发一次爬取
 * - GET  /api/crawler/status       - 获取爬取器状态
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { DIR_OPENSKILLS, CONFIG_FILE } from '../constants/paths';
import { getWorkspaceRoot as getSchedulerWorkspaceRoot } from '../config/schedulerConfig';
import {
  Crawler,
  listCrawlRuns,
  getCrawlRun,
  listCachedRepos,
  CrawlConfig,
  runCrawlFromConfig,
} from '../crawler';
import { OpenSkillsConfig, ApiResponse } from '../types';

const router = Router();

function getWorkspaceRoot(req: Request): string {
  const fromHeader = req.headers['x-workspace-root'] as string | undefined;
  if (fromHeader) return fromHeader;
  return getSchedulerWorkspaceRoot();
}

// 读取配置（带 try/catch，损坏的 config.json 不抛未处理异常）
function loadConfig(workspaceRoot: string): OpenSkillsConfig | null {
  const configPath = path.join(workspaceRoot, DIR_OPENSKILLS, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as OpenSkillsConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Crawler] loadConfig failed:', configPath, message);
    return null;
  }
}

/**
 * GET /api/crawler/runs
 * 获取爬取运行记录列表
 */
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const workspaceRoot = getWorkspaceRoot(req);
    const limit = parseInt(req.query.limit as string) || 20;
    
    const runs = await listCrawlRuns(workspaceRoot);
    const limitedRuns = runs.slice(0, limit);
    
    // 转换为前端期望的格式
    const formattedRuns = limitedRuns.map(run => ({
      id: run.runId,
      status: run.completedAt 
        ? (run.errors && run.errors.length > 0 ? 'failed' : 'completed')
        : 'running',
      reposScanned: run.stats?.reposSearched || 0,
      proposalsCreated: run.stats?.proposalsGenerated || 0,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      error: run.errors && run.errors.length > 0 ? run.errors.join('; ') : undefined,
    }));
    
    res.json({
      success: true,
      data: formattedRuns,
      total: formattedRuns.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list crawl runs',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/crawler/runs/:runId
 * 获取单个运行记录详情
 */
router.get('/runs/:runId', async (req: Request, res: Response) => {
  try {
    const workspaceRoot = getWorkspaceRoot(req);
    const { runId } = req.params;
    
    const run = await getCrawlRun(workspaceRoot, runId);
    
    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'Crawl run not found',
      } as ApiResponse<null>);
    }
    
    res.json({
      success: true,
      data: run,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get crawl run',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/crawler/repos
 * 获取已缓存的仓库列表
 */
router.get('/repos', (req: Request, res: Response) => {
  try {
    const workspaceRoot = getWorkspaceRoot(req);
    const limit = parseInt(req.query.limit as string) || 50;
    
    const repos = listCachedRepos(workspaceRoot).slice(0, limit);
    
    // 转换为前端期望的格式
    const formattedRepos = repos.map(r => ({
      name: r.fullName,
      stars: r.stars,
      lastCrawled: r.crawledAt,
      skillsFound: r.skills?.length || 0,
    }));
    
    res.json({
      success: true,
      data: formattedRepos,
      total: repos.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list cached repos',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/crawler/repos/:owner/:repo
 * 获取单个缓存仓库详情
 */
router.get('/repos/:owner/:repo', (req: Request, res: Response) => {
  try {
    const workspaceRoot = getWorkspaceRoot(req);
    const { owner, repo } = req.params;
    
    const repos = listCachedRepos(workspaceRoot);
    const targetRepo = repos.find(r => r.owner === owner && r.repo === repo);
    
    if (!targetRepo) {
      return res.status(404).json({
        success: false,
        error: 'Cached repo not found',
      } as ApiResponse<null>);
    }
    
    res.json({
      success: true,
      data: targetRepo,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get cached repo',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/crawler/trigger
 * 手动触发一次爬取
 * 
 * Body (optional):
 * {
 *   topics?: string[],
 *   minStars?: number,
 *   maxRepos?: number,
 *   githubToken?: string
 * }
 */
router.post('/trigger', async (req: Request, res: Response) => {
  console.log('[Crawler] POST /trigger called');
  try {
    const workspaceRoot = getWorkspaceRoot(req);
    const config = loadConfig(workspaceRoot);

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'OpenSkills config not found',
      } as ApiResponse<null>);
    }

    const crawl = config.crawl ?? {};
    const githubToken = process.env.GITHUB_TOKEN || req.body?.githubToken || crawl.githubToken || undefined;

    const rawTopics = req.body?.topics ?? crawl.topics ?? [];
    const normalized = (Array.isArray(rawTopics) ? rawTopics : [])
      .map((t: unknown) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t: string) => t.length > 0);
    const topics = normalized.length > 0 ? normalized : ['cursor-skills'];
    const crawlConfig: CrawlConfig = {
      enabled: true,
      topics,
      minStars: req.body?.minStars ?? crawl.minStars ?? 100,
      maxRepos: req.body?.maxRepos || 30,
      githubToken: githubToken,
    };

    const crawler = new Crawler(workspaceRoot, githubToken);
    const result = await crawler.runCrawl(crawlConfig);

    if (result.errors.length > 0) {
      console.error('[Crawler] POST /trigger completed with errors:', result.errors.length);
      result.errors.forEach((e, i) => {
        console.error(`[Crawler] error[${i}]: ${e.repo ? e.repo + ' ' : ''}${e.message}`);
      });
    } else {
      console.log(`[Crawler] POST /trigger completed: reposSearched=${result.reposSearched}, proposalsGenerated=${result.proposalsGenerated}`);
    }

    res.json({
      success: true,
      data: result,
      message: `Crawl completed: ${result.proposalsGenerated} proposals generated`,
    });
  } catch (error: any) {
    const message = error?.message || 'Crawl failed';
    console.error('[Crawler] POST /trigger failed:', message);
    if (error?.stack) console.error('[Crawler] stack:', error.stack);
    res.status(500).json({
      success: false,
      error: message,
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/crawler/status
 * 获取爬取器状态（包括 GitHub API 限流信息）
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const workspaceRoot = getWorkspaceRoot(req);
    const config = loadConfig(workspaceRoot);
    
    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'OpenSkills config not found',
      } as ApiResponse<null>);
    }

    // 优先使用环境变量中的 token，其次使用配置文件中的 token
    const githubToken = process.env.GITHUB_TOKEN || config.crawl.githubToken || undefined;
    const crawler = new Crawler(workspaceRoot, githubToken);
    const status = await crawler.getStatus();
    
    // 获取最近运行信息
    const recentRuns = (await listCrawlRuns(workspaceRoot)).slice(0, 5);
    
    res.json({
      success: true,
      data: {
        enabled: config.crawl.enabled,
        schedule: config.crawl.schedule,
        config: {
          topics: config.crawl.topics,
          minStars: config.crawl.minStars,
        },
        github: {
          hasToken: status.tokenStatus.hasToken,
          rateLimitPerHour: status.tokenStatus.rateLimit,
          remaining: status.rateLimit.remaining,
          resetAt: status.rateLimit.reset.toISOString(),
        },
        recentRuns: recentRuns.map(r => ({
          runId: r.runId,
          completedAt: r.completedAt,
          proposalsGenerated: r.stats.proposalsGenerated,
          errors: r.errors.length,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get status',
    } as ApiResponse<null>);
  }
});

export default router;
