/**
 * mergeScheduler.ts - 文件合并调度
 * 定时检查文件数量和锁状态，触发合并任务
 */
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
  executeMerge,
  MergeConfig,
  MergeResult,
} from '../services/mergeService';
import {
  getProposalsDir,
  getDecisionsDir,
  getHistoryDir,
  getCrawlerRunsDir,
  getWakeHistoryDir,
  getRewardsHistoryDir,
  getMergeHistoryDir,
  listJsonFiles,
  ensureDir,
} from '../utils/fileUtils';
import { checkAgentOperation } from '../utils/lockUtils';

/**
 * Merge scheduler configuration
 */
export interface MergeSchedulerConfig {
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
}

/**
 * Merge record for history
 */
interface MergeRecord {
  timestamp: string;
  triggered: boolean;
  reason: string;
  result?: MergeResult;
  fileCounts: {
    proposals: number;
    decisions: number;
    history: number;
    crawlerRuns: number;
    wakeHistory: number;
    rewardsHistory: number;
    mergeHistory: number;
    total: number;
  };
  error?: string;
}

export class MergeScheduler {
  private task: cron.ScheduledTask | null = null;
  private config: MergeSchedulerConfig;
  private openskillsPath: string;
  private lastRecord: MergeRecord | null = null;

  constructor(config: MergeSchedulerConfig, openskillsPath: string) {
    this.config = config;
    this.openskillsPath = openskillsPath;
  }

  /**
   * 启动合并调度器
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[MergeScheduler] Disabled by config');
      return;
    }

    if (!cron.validate(this.config.schedule)) {
      console.error(`[MergeScheduler] Invalid cron expression: ${this.config.schedule}`);
      return;
    }

    // 使用timezone选项确保时区正确
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cronOptions: cron.ScheduleOptions = {
      timezone: process.env.TZ || systemTimezone || 'UTC',
    };
    this.task = cron.schedule(this.config.schedule, () => {
      this.executeMerge();
    }, cronOptions);

    console.log(`[MergeScheduler] Started with schedule: ${this.config.schedule}`);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[MergeScheduler] Stopped');
    }
  }

  /**
   * 手动触发合并
   */
  async triggerManually(): Promise<MergeRecord> {
    return this.executeMerge();
  }

  /**
   * 执行合并检查
   */
  private async executeMerge(): Promise<MergeRecord> {
    const mergeHistoryPath = getMergeHistoryDir();

    // 确保目录存在
    await this.ensureDirPath(path.dirname(mergeHistoryPath));
    await this.ensureDirPath(mergeHistoryPath);

    // 统计文件数量
    const fileCounts = await this.countFiles();
    const totalCount = fileCounts.total;

    // 检查是否达到阈值
    const shouldMerge = totalCount >= this.config.threshold.fileCount;

    // 检查agent是否在操作
    const agentOperating = await checkAgentOperation();

    const record: MergeRecord = {
      timestamp: new Date().toISOString(),
      triggered: shouldMerge && !agentOperating,
      reason: agentOperating
        ? 'Agent operation in progress, skipping merge'
        : shouldMerge
        ? `File count (${totalCount}) exceeds threshold (${this.config.threshold.fileCount})`
        : `File count (${totalCount}) below threshold (${this.config.threshold.fileCount})`,
      fileCounts,
    };

    // 如果应该合并且agent不在操作，执行合并
    if (shouldMerge && !agentOperating) {
      try {
        const mergeConfig: MergeConfig = {
          enabled: true,
          schedule: this.config.schedule,
          threshold: this.config.threshold,
          strategy: this.config.strategy,
          lockTimeout: this.config.lockTimeout || 1800,
        };

        const result = await executeMerge(mergeConfig);
        record.result = result;

        if (result.success) {
          console.log(
            `[MergeScheduler] Merge completed: proposals=${result.proposals?.merged ?? 0}, ` +
            `decisions=${result.decisions?.merged ?? 0}, history=${result.history?.merged ?? 0}, ` +
            `crawlerRuns=${result.crawlerRuns?.merged ?? 0}, wakeHistory=${result.wakeHistory?.merged ?? 0}, ` +
            `rewardsHistory=${result.rewardsHistory?.merged ?? 0}, backupsCleaned=${result.historyBackupsCleaned ?? 0}, mergeHistoryTrimmed=${result.mergeHistoryTrimmed ?? 0}`
          );
        } else {
          console.error(`[MergeScheduler] Merge failed: ${result.error}`);
          record.error = result.error;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[MergeScheduler] Merge error: ${errorMessage}`);
        record.error = errorMessage;
      }
    } else {
      console.log(`[MergeScheduler] Merge skipped: ${record.reason}`);
    }

    // 记录历史
    const historyFile = path.join(mergeHistoryPath, `${Date.now()}.json`);
    await fsPromises.writeFile(historyFile, JSON.stringify(record, null, 2), 'utf-8');

    this.lastRecord = record;
    return record;
  }

  /**
   * 统计文件数量
   */
  private async countFiles(): Promise<{
    proposals: number;
    decisions: number;
    history: number;
    crawlerRuns: number;
    wakeHistory: number;
    rewardsHistory: number;
    mergeHistory: number;
    total: number;
  }> {
    let proposals = 0;
    let decisions = 0;
    let history = 0;
    let crawlerRuns = 0;
    let wakeHistory = 0;
    let rewardsHistory = 0;
    let mergeHistory = 0;

    try {
      const proposalsDir = getProposalsDir();
      const proposalsFiles = await listJsonFiles(proposalsDir);
      // 排除已经在子目录中的文件（处理 Windows 和 Unix 路径）
      proposals = proposalsFiles.filter((f) => {
        const normalizedPath = f.replace(/\\/g, '/');
        return !normalizedPath.includes('/active/') && !normalizedPath.includes('/archived/') && !normalizedPath.includes('/old/');
      }).length;
    } catch (err) {
      console.error('[MergeScheduler] Error counting proposals:', err);
    }

    try {
      const decisionsDir = getDecisionsDir();
      const decisionsFiles = await listJsonFiles(decisionsDir);
      // 排除已经在子目录中的文件（处理 Windows 和 Unix 路径）
      decisions = decisionsFiles.filter((f) => {
        const normalizedPath = f.replace(/\\/g, '/');
        return !normalizedPath.includes('/archived/') && !normalizedPath.includes('/old/');
      }).length;
    } catch (err) {
      console.error('[MergeScheduler] Error counting decisions:', err);
    }

    try {
      const historyDir = getHistoryDir();
      const historyFiles = await listJsonFiles(historyDir);
      // 排除已经在子目录中的文件（处理 Windows 和 Unix 路径）
      history = historyFiles.filter((f) => {
        const normalizedPath = f.replace(/\\/g, '/');
        return !normalizedPath.includes('/archived/') && !normalizedPath.includes('/old/') && !normalizedPath.includes('/backups/');
      }).length;
    } catch (err) {
      console.error('[MergeScheduler] Error counting history:', err);
    }

    try {
      const crawlerRunsDir = getCrawlerRunsDir();
      const crawlerRunsFiles = await listJsonFiles(crawlerRunsDir);
      // 排除已经在子目录中的文件（处理 Windows 和 Unix 路径）
      crawlerRuns = crawlerRunsFiles.filter((f) => {
        const normalizedPath = f.replace(/\\/g, '/');
        return !normalizedPath.includes('/archived/') && !normalizedPath.includes('/old/');
      }).length;
    } catch (err) {
      console.error('[MergeScheduler] Error counting crawler runs:', err);
    }

    try {
      const wakeHistoryDir = getWakeHistoryDir();
      const wakeHistoryFiles = await listJsonFiles(wakeHistoryDir);
      // 排除已经在子目录中的文件（处理 Windows 和 Unix 路径）
      wakeHistory = wakeHistoryFiles.filter((f) => {
        const normalizedPath = f.replace(/\\/g, '/');
        return !normalizedPath.includes('/archived/') && !normalizedPath.includes('/old/');
      }).length;
    } catch (err) {
      console.error('[MergeScheduler] Error counting wake history:', err);
    }

    try {
      const rewardsHistoryDir = getRewardsHistoryDir();
      const rewardsFiles = await listJsonFiles(rewardsHistoryDir);
      // 只统计根目录下的奖励记录（文件名格式: {timestamp}-{proposalId}.json）
      rewardsHistory = rewardsFiles.filter((f) => {
        const normalizedPath = f.replace(/\\/g, '/');
        if (normalizedPath.includes('/archived/')) return false;
        const base = path.basename(f, '.json');
        return /^\d+-[0-9a-f-]+$/i.test(base);
      }).length;
    } catch (err) {
      console.error('[MergeScheduler] Error counting rewards history:', err);
    }

    try {
      const mergeHistoryDir = getMergeHistoryDir();
      const mergeFiles = await listJsonFiles(mergeHistoryDir);
      mergeHistory = mergeFiles.filter((f) => /^\d+\.json$/.test(path.basename(f))).length;
    } catch (err) {
      console.error('[MergeScheduler] Error counting merge history:', err);
    }

    return {
      proposals,
      decisions,
      history,
      crawlerRuns,
      wakeHistory,
      rewardsHistory,
      mergeHistory,
      total: proposals + decisions + history + crawlerRuns + wakeHistory + rewardsHistory + mergeHistory,
    };
  }

  /**
   * 获取合并历史
   */
  getHistory(limit = 50): MergeRecord[] {
    const historyPath = getMergeHistoryDir();

    if (!fs.existsSync(historyPath)) {
      return [];
    }

    try {
      const files = fs.readdirSync(historyPath)
        .filter((f) => f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a)) // 最新的在前
        .slice(0, limit);

      return files.map((f) => {
        const content = fs.readFileSync(path.join(historyPath, f), 'utf-8');
        return JSON.parse(content) as MergeRecord;
      });
    } catch {
      console.error('[MergeScheduler] Error reading history');
      return [];
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
    lastRecord: MergeRecord | null;
  } {
    return {
      active: this.task !== null && this.config.enabled,
      enabled: this.config.enabled,
      nextRun: this.task ? this.getNextRunTime() : null,
      lastRun: this.lastRecord?.timestamp || null,
      schedule: this.config.schedule,
      lastRecord: this.lastRecord,
    };
  }

  /**
   * 获取下次运行时间描述
   */
  private getNextRunTime(): string {
    // node-cron 没有直接获取下次执行时间的 API
    // 可以使用 cron-parser 来计算，这里简单返回 schedule
    return `Based on schedule: ${this.config.schedule}`;
  }

  /**
   * 确保目录存在
   */
  private async ensureDirPath(dirPath: string): Promise<void> {
    await ensureDir(dirPath);
  }

}
