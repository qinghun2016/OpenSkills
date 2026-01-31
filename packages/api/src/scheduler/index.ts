/**
 * scheduler/index.ts - 调度器入口
 * 统一管理所有调度任务的初始化和停止
 */
import * as path from 'path';
import { WakeScheduler } from './wakeScheduler';
import { CrawlScheduler } from './crawlScheduler';
import { HandoffMonitor } from './handoffMonitor';
import { MergeScheduler, MergeSchedulerConfig } from './mergeScheduler';

export interface SchedulerConfig {
  openskillsPath: string;
  workspaceRoot: string;
  wake: {
    enabled: boolean;
    schedule: string;
    reminderPrompt: string;
  };
  crawl: {
    enabled: boolean;
    schedule: string;
    minStars?: number;
    topics?: string[];
    githubToken?: string;
  };
  handoff: {
    maxContextTokens: number;
    compressWhenAbove: number;
  };
  merge: MergeSchedulerConfig;
}

export interface SchedulerInstances {
  wake: WakeScheduler;
  crawl: CrawlScheduler;
  handoff: HandoffMonitor;
  merge: MergeScheduler;
}

let instances: SchedulerInstances | null = null;

/**
 * 初始化所有调度任务
 */
export function initScheduler(config: SchedulerConfig): SchedulerInstances {
  if (instances) {
    console.warn('[Scheduler] Already initialized, stopping existing schedulers');
    stopScheduler();
  }

  console.log('[Scheduler] Initializing...');

  // 创建调度器实例
  const wakeScheduler = new WakeScheduler(config.wake, config.openskillsPath);
  const crawlScheduler = new CrawlScheduler(config.crawl, config.workspaceRoot);
  const handoffMonitor = new HandoffMonitor(config.handoff, config.openskillsPath);
  const mergeScheduler = new MergeScheduler(config.merge, config.openskillsPath);

  // 启动调度器
  // #region agent log
  const debugLog = async (location: string, message: string, data: any, hypothesisId: string) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const workspaceRoot = config.workspaceRoot;
      const logPath = path.join(workspaceRoot, '.cursor', 'debug.log');
      // 确保目录存在
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      const logEntry = JSON.stringify({location,message,data,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId}) + '\n';
      await fs.appendFile(logPath, logEntry, 'utf-8');
    } catch (err) {
      console.error('[DebugLog] Failed to write log:', err);
    }
  };
  debugLog('scheduler/index.ts:56', 'Starting crawlScheduler', {crawlEnabled:config.crawl.enabled,crawlSchedule:config.crawl.schedule}, 'A').catch(()=>{});
  // #endregion
  wakeScheduler.start();
  crawlScheduler.start();
  handoffMonitor.start();
  mergeScheduler.start();
  // #region agent log
  const crawlStatus = crawlScheduler.getStatus();
  debugLog('scheduler/index.ts:58', 'After crawlScheduler.start()', {crawlActive:crawlStatus.active,crawlEnabled:crawlStatus.enabled,crawlSchedule:crawlStatus.schedule}, 'D').catch(()=>{});
  // #endregion

  instances = {
    wake: wakeScheduler,
    crawl: crawlScheduler,
    handoff: handoffMonitor,
    merge: mergeScheduler,
  };

  console.log('[Scheduler] All schedulers initialized');

  return instances;
}

/**
 * 停止所有调度任务
 */
export function stopScheduler(): void {
  if (!instances) {
    console.warn('[Scheduler] No active schedulers to stop');
    return;
  }

  console.log('[Scheduler] Stopping all schedulers...');

  instances.wake.stop();
  instances.crawl.stop();
  instances.handoff.stop();
  instances.merge.stop();

  instances = null;

  console.log('[Scheduler] All schedulers stopped');
}

/**
 * 获取调度器实例
 */
export function getSchedulerInstances(): SchedulerInstances | null {
  return instances;
}


/**
 * 获取所有调度器的综合状态
 */
export function getSchedulerStatus(): {
  initialized: boolean;
  wake: ReturnType<WakeScheduler['getStatus']> | null;
  crawl: ReturnType<CrawlScheduler['getStatus']> | null;
  handoff: ReturnType<HandoffMonitor['getStatus']> | null;
  merge: ReturnType<MergeScheduler['getStatus']> | null;
} {
  if (!instances) {
    return {
      initialized: false,
      wake: null,
      crawl: null,
      handoff: null,
      merge: null,
    };
  }

  return {
    initialized: true,
    wake: instances.wake.getStatus(),
    crawl: instances.crawl.getStatus(),
    handoff: instances.handoff.getStatus(),
    merge: instances.merge.getStatus(),
  };
}

// 导出类型和类供外部使用
export { WakeScheduler } from './wakeScheduler';
export { CrawlScheduler } from './crawlScheduler';
export { HandoffMonitor } from './handoffMonitor';
export { MergeScheduler, MergeSchedulerConfig } from './mergeScheduler';
