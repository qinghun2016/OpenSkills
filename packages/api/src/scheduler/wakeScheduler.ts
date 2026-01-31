/**
 * wakeScheduler.ts - 自动唤醒调度
 * 定时检查 pending proposals 并触发唤醒
 */
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import { readAllFromArchives } from '../utils/archiveReader';
import { getPendingCount } from '../services/proposalService';

interface WakeRecord {
  timestamp: string;
  pendingCount: number;
  reminderPrompt: string;
  triggered: boolean;
}

interface WakeConfig {
  enabled: boolean;
  schedule: string;
  reminderPrompt: string;
}

export class WakeScheduler {
  private task: cron.ScheduledTask | null = null;
  private config: WakeConfig;
  private openskillsPath: string;

  constructor(config: WakeConfig, openskillsPath: string) {
    this.config = config;
    this.openskillsPath = openskillsPath;
  }

  /**
   * 启动唤醒调度器
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[WakeScheduler] Disabled by config');
      return;
    }

    if (!cron.validate(this.config.schedule)) {
      console.error(`[WakeScheduler] Invalid cron expression: ${this.config.schedule}`);
      return;
    }

    // 使用timezone选项确保时区正确
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cronOptions: cron.ScheduleOptions = {
      timezone: process.env.TZ || systemTimezone || 'UTC',
    };
    this.task = cron.schedule(this.config.schedule, () => {
      this.executeWake().catch((err) =>
        console.error('[WakeScheduler] executeWake failed:', err)
      );
    }, cronOptions);

    console.log(`[WakeScheduler] Started with schedule: ${this.config.schedule}`);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[WakeScheduler] Stopped');
    }
  }

  /**
   * 手动触发唤醒
   */
  async triggerManually(): Promise<WakeRecord> {
    return this.executeWake();
  }

  /**
   * 执行唤醒检查
   * Uses proposalService.getPendingCount() for accurate count (status === 'pending' only).
   */
  private async executeWake(): Promise<WakeRecord> {
    const wakePath = path.join(this.openskillsPath, 'wake');
    const historyPath = path.join(wakePath, 'history');

    // 确保目录存在
    this.ensureDir(wakePath);
    this.ensureDir(historyPath);

    // 使用 proposalService 统计真正 status===pending 的提案
    const pendingCount = await getPendingCount();
    const triggered = pendingCount > 0;

    const record: WakeRecord = {
      timestamp: new Date().toISOString(),
      pendingCount,
      reminderPrompt: this.config.reminderPrompt,
      triggered,
    };

    if (triggered) {
      // 写入 pending.json
      const pendingFile = path.join(wakePath, 'pending.json');
      fs.writeFileSync(pendingFile, JSON.stringify(record, null, 2), 'utf-8');
      console.log(`[WakeScheduler] Wake triggered: ${pendingCount} pending proposals`);
    }

    // 记录历史
    const historyFile = path.join(historyPath, `${Date.now()}.json`);
    fs.writeFileSync(historyFile, JSON.stringify(record, null, 2), 'utf-8');

    return record;
  }

  /**
   * 获取唤醒历史
   * 从以下位置读取：
   * 1. wake/history/ (向后兼容)
   * 2. wake/history/archived/ (合并后的归档文件)
   */
  async getHistory(limit = 50): Promise<WakeRecord[]> {
    try {
      // 使用 openskillsPath 构建历史目录路径
      const historyDir = path.join(this.openskillsPath, 'wake', 'history');
      
      // 定义要读取的目录（按优先级顺序）
      // readAllFromArchives 会自动从 archived/ 子目录读取
      const dirs = [historyDir];

      // 从所有目录读取（包括归档文件）
      const allRecords = await readAllFromArchives<WakeRecord>(dirs);

      // 按时间戳降序排列（最新的在前）
      const sorted = allRecords.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // 应用 limit 限制
      return sorted.slice(0, limit);
    } catch (error) {
      console.error('[WakeScheduler] Error reading history:', error);
      return [];
    }
  }

  /**
   * 读取 wake/pending.json，返回待唤醒状态（与扩展诊断一致）
   */
  getPendingStatus(): { hasPending: boolean; pendingCount: number; processed: boolean } {
    const pendingFile = path.join(this.openskillsPath, 'wake', 'pending.json');
    if (!fs.existsSync(pendingFile)) {
      return { hasPending: false, pendingCount: 0, processed: true };
    }
    try {
      const content = fs.readFileSync(pendingFile, 'utf-8');
      const data = JSON.parse(content) as { pendingCount?: number; processed?: boolean };
      const pendingCount = data.pendingCount ?? 0;
      const processed = data.processed === true;
      return {
        hasPending: pendingCount > 0 && !processed,
        pendingCount,
        processed,
      };
    } catch {
      return { hasPending: false, pendingCount: 0, processed: true };
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
    pending: { hasPending: boolean; pendingCount: number; processed: boolean };
  } {
    return {
      active: this.task !== null && this.config.enabled,
      enabled: this.config.enabled,
      nextRun: this.task ? this.getNextRunTime() : null,
      lastRun: null, // TODO: 实现 lastRun 跟踪
      schedule: this.config.schedule,
      pending: this.getPendingStatus(),
    };
  }

  private getNextRunTime(): string | null {
    // node-cron 没有直接获取下次执行时间的 API
    // 可以使用 cron-parser 来计算，这里简单返回 schedule
    return `Based on schedule: ${this.config.schedule}`;
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
