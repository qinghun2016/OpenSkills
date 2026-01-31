/**
 * handoffMonitor.ts - 交接监控
 * 定期检查管理员上下文状态，在 token 超过阈值时触发交接
 */
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';

interface HandoffConfig {
  maxContextTokens: number;
  compressWhenAbove: number;
}

interface ContextEstimate {
  timestamp: string;
  estimatedTokens: number;
  source: 'plugin' | 'api' | 'skill';
}

interface HandoffTrigger {
  timestamp: string;
  estimatedTokens: number;
  threshold: number;
  reason: string;
  triggered: boolean;
}

/**
 * 单条决策记录（供交接时共享劳动成果）
 */
export interface HandoffDecisionRecord {
  proposalId: string;
  decision: 'approve' | 'reject';
  /** Files touched by this decision (e.g. .cursor/skills/foo/SKILL.md) */
  files?: string[];
}

/**
 * 交接快照：Agent 在 token 接近上限时保存的上下文摘要，供新 Agent 从断点继续
 * 含 touchedFiles / decisionsMade 时，不同交接的 skills-admin 可共享劳动成果
 */
export interface HandoffSnapshot {
  pendingProposals: string[];
  inProgressDecision?: { proposalId: string; partialReason?: string };
  summary: string;
  timestamp: string;
  /** Files touched in this session (for labor sharing between handoffs) */
  touchedFiles?: string[];
  /** Decisions made in this session (proposalId, decision, files) */
  decisionsMade?: HandoffDecisionRecord[];
}

export class HandoffMonitor {
  private task: cron.ScheduledTask | null = null;
  private config: HandoffConfig;
  private openskillsPath: string;
  private checkInterval: string = '*/1 * * * *'; // 每分钟检查一次
  private lastTrigger: HandoffTrigger | null = null;

  constructor(config: HandoffConfig, openskillsPath: string) {
    this.config = config;
    this.openskillsPath = openskillsPath;
  }

  /**
   * 设置检查间隔（cron 表达式）
   */
  setCheckInterval(interval: string): void {
    this.checkInterval = interval;
  }

  /**
   * 启动交接监控器
   */
  start(): void {
    if (!cron.validate(this.checkInterval)) {
      console.error(`[HandoffMonitor] Invalid cron expression: ${this.checkInterval}`);
      return;
    }

    this.task = cron.schedule(this.checkInterval, () => {
      this.checkContext();
    });

    console.log(`[HandoffMonitor] Started with interval: ${this.checkInterval}`);
  }

  /**
   * 停止监控器
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[HandoffMonitor] Stopped');
    }
  }

  /**
   * 手动触发交接
   */
  triggerManually(reason = 'Manual trigger'): HandoffTrigger {
    const estimate = this.readContextEstimate();
    return this.createTrigger(estimate?.estimatedTokens ?? 0, reason, true);
  }

  /**
   * 更新上下文估算（供 API 调用）
   */
  updateContextEstimate(estimatedTokens: number, source: ContextEstimate['source'] = 'api'): void {
    const handoffPath = path.join(this.openskillsPath, 'handoff');
    this.ensureDir(handoffPath);

    const estimate: ContextEstimate = {
      timestamp: new Date().toISOString(),
      estimatedTokens,
      source,
    };

    const estimateFile = path.join(handoffPath, 'context-estimate.json');
    fs.writeFileSync(estimateFile, JSON.stringify(estimate, null, 2), 'utf-8');
    console.log(`[HandoffMonitor] Context estimate updated: ${estimatedTokens} tokens`);

    // 立即检查是否需要触发交接
    this.checkContext();
  }

  /**
   * 检查上下文状态
   */
  private checkContext(): void {
    const estimate = this.readContextEstimate();

    if (!estimate) {
      return; // 没有估算数据，跳过检查
    }

    if (estimate.estimatedTokens > this.config.compressWhenAbove) {
      this.createTrigger(
        estimate.estimatedTokens,
        `Token count (${estimate.estimatedTokens}) exceeds threshold (${this.config.compressWhenAbove})`,
        true
      );
    }
  }

  /**
   * 读取上下文估算
   */
  private readContextEstimate(): ContextEstimate | null {
    const estimateFile = path.join(this.openskillsPath, 'handoff', 'context-estimate.json');

    if (!fs.existsSync(estimateFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(estimateFile, 'utf-8');
      return JSON.parse(content) as ContextEstimate;
    } catch {
      console.error('[HandoffMonitor] Error reading context estimate');
      return null;
    }
  }

  /**
   * 创建交接触发信号
   */
  private createTrigger(estimatedTokens: number, reason: string, triggered: boolean): HandoffTrigger {
    const handoffPath = path.join(this.openskillsPath, 'handoff');
    this.ensureDir(handoffPath);

    const trigger: HandoffTrigger = {
      timestamp: new Date().toISOString(),
      estimatedTokens,
      threshold: this.config.compressWhenAbove,
      reason,
      triggered,
    };

    // 写入 trigger.json
    const triggerFile = path.join(handoffPath, 'trigger.json');
    fs.writeFileSync(triggerFile, JSON.stringify(trigger, null, 2), 'utf-8');

    this.lastTrigger = trigger;
    console.log(`[HandoffMonitor] Handoff triggered: ${reason}`);

    return trigger;
  }

  /**
   * 获取监控器状态
   */
  getStatus(): {
    active: boolean;
    checkInterval: string;
    threshold: number;
    maxTokens: number;
    lastTrigger: HandoffTrigger | null;
    currentEstimate: ContextEstimate | null;
  } {
    return {
      active: this.task !== null,
      checkInterval: this.checkInterval,
      threshold: this.config.compressWhenAbove,
      maxTokens: this.config.maxContextTokens,
      lastTrigger: this.lastTrigger,
      currentEstimate: this.readContextEstimate(),
    };
  }

  /**
   * 清除交接触发信号（交接完成后调用）
   */
  clearTrigger(): void {
    const triggerFile = path.join(this.openskillsPath, 'handoff', 'trigger.json');
    if (fs.existsSync(triggerFile)) {
      fs.unlinkSync(triggerFile);
      console.log('[HandoffMonitor] Trigger cleared');
    }
    this.lastTrigger = null;
  }

  /**
   * 保存交接快照（Agent 在压缩上下文时调用，或通过 API POST /api/scheduler/handoff/snapshot）
   * 写入 .openskills/handoff/latest.json，供新 Agent 读取并从断点继续
   */
  saveSnapshot(snapshot: HandoffSnapshot): void {
    const handoffPath = path.join(this.openskillsPath, 'handoff');
    this.ensureDir(handoffPath);
    const latestFile = path.join(handoffPath, 'latest.json');
    const data = {
      ...snapshot,
      timestamp: snapshot.timestamp || new Date().toISOString(),
    };
    fs.writeFileSync(latestFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[HandoffMonitor] Snapshot saved');
  }

  /**
   * 读取交接快照（新 Agent 启动时调用，或通过 API GET /api/scheduler/handoff/snapshot）
   */
  readSnapshot(): HandoffSnapshot | null {
    const latestFile = path.join(this.openskillsPath, 'handoff', 'latest.json');
    if (!fs.existsSync(latestFile)) {
      return null;
    }
    try {
      const content = fs.readFileSync(latestFile, 'utf-8');
      return JSON.parse(content) as HandoffSnapshot;
    } catch {
      console.error('[HandoffMonitor] Error reading snapshot');
      return null;
    }
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
