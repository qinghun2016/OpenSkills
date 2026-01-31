/**
 * crawlScheduler.ts - 爬取调度
 * 按配置的 cron 表达式定时触发爬取任务
 */
import * as cron from 'node-cron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Crawler, CrawlRunResult, CrawlConfig as CrawlerCrawlConfig } from '../crawler';

// Debug logging helper
async function debugLog(location: string, message: string, data: any, hypothesisId: string): Promise<void> {
  try {
    // 获取工作区根目录（与index.ts中的getWorkspaceRoot逻辑一致）
    const workspaceRoot = process.env.WORKSPACE_ROOT || (process.cwd().includes('packages') ? path.resolve(process.cwd(), '../..') : process.cwd());
    const logPath = path.join(workspaceRoot, '.cursor', 'debug.log');
    // 确保目录存在
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const logEntry = JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId,
    }) + '\n';
    await fs.appendFile(logPath, logEntry, 'utf-8');
  } catch (err) {
    // Ignore logging errors
    console.error('[DebugLog] Failed to write log:', err);
  }
}

interface SchedulerCrawlConfig {
  enabled: boolean;
  schedule: string;
  minStars?: number;
  topics?: string[];
  githubToken?: string;
}

interface CrawlResult {
  timestamp: string;
  success: boolean;
  message?: string;
  itemsCrawled?: number;
  runId?: string;
  proposalsGenerated?: number;
}

export class CrawlScheduler {
  private task: cron.ScheduledTask | null = null;
  private config: SchedulerCrawlConfig;
  private workspaceRoot: string;
  private lastResult: CrawlResult | null = null;

  constructor(config: SchedulerCrawlConfig, workspaceRoot: string) {
    this.config = config;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * 启动爬取调度器
   */
  start(): void {
    // #region agent log
    debugLog('crawlScheduler.ts:39', 'CrawlScheduler.start() called', {enabled:this.config.enabled,schedule:this.config.schedule,workspaceRoot:this.workspaceRoot}, 'A').catch(()=>{});
    // #endregion
    if (!this.config.enabled) {
      // #region agent log
      debugLog('crawlScheduler.ts:42', 'CrawlScheduler disabled by config', {enabled:this.config.enabled}, 'A').catch(()=>{});
      // #endregion
      console.log('[CrawlScheduler] Disabled by config');
      return;
    }

    // #region agent log
    const cronValid = cron.validate(this.config.schedule);
    debugLog('crawlScheduler.ts:45', 'Cron validation result', {schedule:this.config.schedule,valid:cronValid}, 'B').catch(()=>{});
    // #endregion
    if (!cronValid) {
      console.error(`[CrawlScheduler] Invalid cron expression: ${this.config.schedule}`);
      return;
    }

    // #region agent log
    const beforeTask = this.task;
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    debugLog('crawlScheduler.ts:50', 'Before cron.schedule()', {taskBefore:beforeTask===null?'null':'exists',schedule:this.config.schedule,timezone:systemTimezone}, 'C,D').catch(()=>{});
    // #endregion
    // node-cron 3.0+ 支持 timezone 选项，但需要确保时区数据可用
    // 如果容器时区是UTC，cron表达式会按UTC时间执行
    // 解决方案：使用timezone选项指定时区，或调整cron表达式为UTC时间
    const cronOptions: cron.ScheduleOptions = {
      timezone: process.env.TZ || systemTimezone || 'UTC',
    };
    this.task = cron.schedule(this.config.schedule, async () => {
      // #region agent log
      debugLog('crawlScheduler.ts:51', 'Cron callback triggered', {currentTime:new Date().toISOString(),schedule:this.config.schedule,timezone:systemTimezone}, 'E').catch(()=>{});
      // #endregion
      await this.executeCrawl();
    }, cronOptions);
    // #region agent log
    const afterTask = this.task;
    debugLog('crawlScheduler.ts:54', 'After cron.schedule()', {taskAfter:afterTask===null?'null':'exists'}, 'D').catch(()=>{});
    // #endregion

    console.log(`[CrawlScheduler] Started with schedule: ${this.config.schedule}`);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[CrawlScheduler] Stopped');
    }
  }

  /**
   * 手动触发爬取
   */
  async triggerManually(): Promise<CrawlResult> {
    return this.executeCrawl();
  }

  /**
   * 执行爬取
   */
  private async executeCrawl(): Promise<CrawlResult> {
    // #region agent log
    debugLog('crawlScheduler.ts:78', 'executeCrawl() called', {timestamp:new Date().toISOString()}, 'E').catch(()=>{});
    // #endregion
    try {
      console.log('[CrawlScheduler] Starting crawl...');
      
      // 优先使用环境变量中的 token，其次使用配置文件中的 token
      const githubToken = process.env.GITHUB_TOKEN || this.config.githubToken;
      
      // 创建 Crawler 实例
      const crawler = new Crawler(this.workspaceRoot, githubToken);
      
      // Normalize topics: trim, drop empty; default if none (avoids newline/space in config)
      const raw = Array.isArray(this.config.topics) ? this.config.topics : [];
      const normalized = raw.map((t) => (typeof t === 'string' ? t.trim() : '')).filter((t) => t.length > 0);
      const effectiveTopics = normalized.length > 0 ? normalized : ['cursor-skills'];
      const crawlConfig: CrawlerCrawlConfig = {
        enabled: true,
        topics: effectiveTopics,
        minStars: this.config.minStars ?? 100,
        githubToken: githubToken,
      };
      
      // 执行爬取
      const runResult: CrawlRunResult = await crawler.runCrawl(crawlConfig);
      
      const result: CrawlResult = {
        timestamp: runResult.completedAt,
        success: runResult.errors.length === 0,
        message: `Crawl completed: ${runResult.proposalsGenerated} proposals generated`,
        itemsCrawled: runResult.skillsFound,
        runId: runResult.runId,
        proposalsGenerated: runResult.proposalsGenerated,
      };
      
      this.lastResult = result;
      console.log(`[CrawlScheduler] Crawl completed: ${runResult.proposalsGenerated} proposals`);
      return result;
    } catch (error) {
      const result: CrawlResult = {
        timestamp: new Date().toISOString(),
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      this.lastResult = result;
      console.error('[CrawlScheduler] Crawl failed:', error);
      return result;
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    active: boolean;
    enabled: boolean;
    nextRun: string | null;
    lastRun: string | null;
    schedule: string;
    lastResult: CrawlResult | null;
  } {
    return {
      active: this.task !== null,
      enabled: this.config.enabled,
      nextRun: this.task ? `Based on schedule: ${this.config.schedule}` : null,
      lastRun: this.lastResult?.timestamp || null,
      schedule: this.config.schedule,
      lastResult: this.lastResult,
    };
  }
}
