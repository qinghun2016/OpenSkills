/**
 * Status Bar Provider
 * 显示 pending 数量和管理员状态
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AdminMode } from '../types';
import { getApiClient } from '../api/client';
import { 
  skillsAdminExists, 
  getWorkspaceRoot, 
  getFirstWorkspaceFolder,
  getOpenSkillsDir,
  getSkillsAdminPath 
} from '../utils/paths';
import { getLastActivationTimeMs } from '../extension';

interface SkillsAdminStatus {
  exists: boolean;
  verified: boolean;
  needsReload: boolean;
  path?: string;
}

interface WakeStatus {
  hasPending: boolean;
  pendingCount: number;
  processed: boolean;
}

export class StatusBarProvider {
  private statusBarItem: vscode.StatusBarItem;
  private pendingCount: number = 0;
  private adminMode: AdminMode = 'agent_then_human';
  private apiAvailable: boolean = false;
  private skillsAdminStatus: SkillsAdminStatus = { exists: false, verified: false, needsReload: false };
  private wakeStatus: WakeStatus = { hasPending: false, pendingCount: 0, processed: false };

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'openskills.openDiagnosePanel';
    this.update();
    this.statusBarItem.show();
    this.checkSkillsAdminStatus();
    this.checkWakeStatus();
  }

  /**
   * 更新状态栏
   * 增强版本：更清晰的状态显示和颜色指示
   */
  update(): void {
    const parts: string[] = [];

    // OpenSkills 图标
    parts.push('$(extensions)');

    // pending 数量
    if (this.pendingCount > 0) {
      parts.push(`${this.pendingCount} pending`);
    } else {
      parts.push('OpenSkills');
    }

    // Skills-admin 状态指示（优先级：不存在 > 需要重新加载 > 未验证 > 正常）
    if (!this.skillsAdminStatus.exists) {
      parts.push('$(error)'); // 红色错误图标：不存在
    } else if (this.skillsAdminStatus.needsReload) {
      parts.push('$(sync~spin)'); // 旋转图标：需要重新加载
    } else if (!this.skillsAdminStatus.verified) {
      parts.push('$(warning)'); // 黄色警告图标：未验证
    }
    // 正常状态不显示图标，避免状态栏过于拥挤

    // 唤醒状态指示
    if (this.wakeStatus.hasPending && !this.wakeStatus.processed) {
      parts.push('$(bell)'); // 铃铛图标：有待唤醒
    }

    // 管理员模式指示（可选，仅在非默认模式时显示）
    const modeIcon = this.getModeIcon();
    if (modeIcon && this.adminMode !== 'agent_then_human') {
      parts.push(modeIcon);
    }

    // API 状态（仅在未连接时显示警告）
    if (!this.apiAvailable) {
      parts.push('$(warning)');
    }

    this.statusBarItem.text = parts.join(' ');
    this.statusBarItem.tooltip = this.getTooltip();
    
    // 根据状态设置背景颜色（优先级：错误 > 警告 > 正常）
    if (!this.skillsAdminStatus.exists) {
      // 红色背景：skills-admin 不存在，严重问题
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (this.skillsAdminStatus.needsReload || 
               (this.wakeStatus.hasPending && !this.wakeStatus.processed) ||
               !this.skillsAdminStatus.verified) {
      // 黄色背景：需要用户操作（重新加载或触发唤醒）
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      // 正常背景：所有状态正常
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  /**
   * 获取管理员模式图标
   */
  private getModeIcon(): string {
    switch (this.adminMode) {
      case 'human_only':
        return '$(person)';
      case 'agent_only':
        return '$(hubot)';
      case 'agent_then_human':
        return '$(organization)';
      default:
        return '';
    }
  }

  /**
   * 获取 tooltip
   * 增强版本：提供更详细和清晰的状态信息
   */
  private getTooltip(): string {
    const lines: string[] = ['OpenSkills 状态'];
    lines.push('');

    // Skills-admin Agent 状态（详细）
    // 重要：skills-admin 是一个 Cursor Agent，通过 SKILL.md 文件定义
    // 文件存在 ≠ Agent 可用，Cursor 需要重新加载窗口才能识别
    if (!this.skillsAdminStatus.exists) {
      lines.push('❌ Skills Admin Agent: 不存在');
      lines.push('   状态: 文件不存在');
      lines.push('   影响: Cursor 无法识别 skills-admin Agent，无法自动审查 proposals');
      lines.push('   建议: 运行 "OpenSkills: Health Check" 创建');
    } else if (this.skillsAdminStatus.needsReload) {
      lines.push('⚠️ Skills Admin Agent: 文件存在但尚未加载');
      lines.push('   状态: SKILL.md 文件已创建，但 Cursor 尚未加载 Agent');
      lines.push('   原因: Cursor 在启动时扫描 skills，之后不会自动重新扫描');
      lines.push('   影响: Agent 不可用，无法自动审查 proposals');
      lines.push('   必须: Ctrl+Shift+P → Developer: Reload Window');
      if (this.skillsAdminStatus.path) {
        lines.push(`   文件路径: ${this.skillsAdminStatus.path}`);
      }
    } else if (!this.skillsAdminStatus.verified) {
      lines.push('⚠️ Skills Admin Agent: 文件存在但内容损坏');
      lines.push('   状态: SKILL.md 文件存在但内容不完整或损坏');
      lines.push('   影响: Cursor 无法正确识别 skills-admin Agent');
      lines.push('   建议: 运行 "OpenSkills: Health Check" 修复文件');
      if (this.skillsAdminStatus.path) {
        lines.push(`   文件路径: ${this.skillsAdminStatus.path}`);
      }
    } else {
      lines.push('✅ Skills Admin Agent: 可能可用');
      lines.push('   状态: SKILL.md 文件存在且内容完整');
      lines.push('   注意: 无法100%确定 Cursor 已加载 Agent');
      lines.push('   如果 Agent 无法使用，尝试重新加载窗口');
      if (this.skillsAdminStatus.path) {
        lines.push(`   文件路径: ${this.skillsAdminStatus.path}`);
      }
    }
    lines.push('');

    // 唤醒状态（详细）
    if (this.wakeStatus.hasPending && !this.wakeStatus.processed) {
      lines.push(`🔔 唤醒机制: 有待处理提案`);
      lines.push(`   状态: ${this.wakeStatus.pendingCount} 个待处理提案需要唤醒`);
      lines.push('   影响: 需要触发 Agent 审查这些提案');
      lines.push('   建议: 运行 "OpenSkills: Trigger Wake" 触发自动审查');
    } else if (this.wakeStatus.processed) {
      lines.push('✅ 唤醒机制: 正常');
      lines.push('   状态: 无待处理的唤醒请求');
      if (this.wakeStatus.pendingCount > 0) {
        lines.push(`   说明: 有 ${this.wakeStatus.pendingCount} 个提案，但已处理`);
      }
    } else {
      lines.push('✅ 唤醒机制: 正常');
      lines.push('   状态: 无待处理的唤醒请求');
    }
    lines.push('');

    // 其他状态
    lines.push('📋 其他状态:');
    lines.push(`   Pending Proposals: ${this.pendingCount}`);
    lines.push(`   Admin Mode: ${this.adminMode}`);
    lines.push(`   API Status: ${this.apiAvailable ? '✅ 已连接' : '⚠️ 未连接'}`);

    lines.push('');
    lines.push('💡 提示: 点击状态栏查看详细诊断报告');

    return lines.join('\n');
  }

  /**
   * 设置 pending 数量
   */
  setPendingCount(count: number): void {
    this.pendingCount = count;
    this.update();
  }

  /**
   * 设置管理员模式
   */
  setAdminMode(mode: AdminMode): void {
    this.adminMode = mode;
    this.update();
  }

  /**
   * 设置 API 可用状态
   */
  setApiAvailable(available: boolean): void {
    this.apiAvailable = available;
    this.update();
  }

  /**
   * 检查 skills-admin 状态
   * 增强版本：更准确地检测文件状态和是否需要重新加载
   */
  private checkSkillsAdminStatus(): void {
    const cursorRoot = getFirstWorkspaceFolder();
    if (!cursorRoot) {
      this.skillsAdminStatus = { exists: false, verified: false, needsReload: false };
      return;
    }

    // 检查「当前打开的」工作区文件夹下的 skills-admin（Cursor 只扫描该路径）
    const projectSkillsAdminPath = path.join(cursorRoot, '.cursor', 'skills', 'skills-admin', 'SKILL.md');
    if (!fs.existsSync(projectSkillsAdminPath)) {
      this.skillsAdminStatus = { exists: false, verified: false, needsReload: false };
      return;
    }

    try {
      // 检查文件是否可读
      const stats = fs.statSync(projectSkillsAdminPath);
      if (!stats.isFile()) {
        this.skillsAdminStatus = { exists: true, verified: false, needsReload: false, path: projectSkillsAdminPath };
        return;
      }

      // 读取并验证文件内容
      const content = fs.readFileSync(projectSkillsAdminPath, 'utf-8');
      const hasMinimumLength = content.length > 100; // 至少100字符
      const hasSkillsAdminName = content.includes('skills-admin');
      const hasTriggerKeywords = content.includes('审查建议') || content.includes('审查 proposals');
      const hasAdminSection = content.includes('Skills Admin') || content.includes('管理员');
      
      const verified = hasMinimumLength && 
                      (hasSkillsAdminName || hasAdminSection) && 
                      hasTriggerKeywords;

      // 与 healthCheck 一致：仅当文件在最近 30 秒内被修改时才视为“需重新加载”
      const nowMs = Date.now();
      const needsReload = stats.mtimeMs > nowMs - 30 * 1000;

      this.skillsAdminStatus = {
        exists: true,
        verified,
        needsReload,
        path: projectSkillsAdminPath
      };
    } catch (error) {
      // 文件存在但无法读取，可能是权限问题或文件损坏
      this.skillsAdminStatus = { 
        exists: true, 
        verified: false, 
        needsReload: false, 
        path: projectSkillsAdminPath 
      };
    }
  }

  /**
   * 检查唤醒状态
   * 增强版本：更准确地检测唤醒机制状态
   */
  private checkWakeStatus(): void {
    const workspaceRoot = getWorkspaceRoot();
    const openSkillsDir = getOpenSkillsDir();
    if (!workspaceRoot || !openSkillsDir) {
      this.wakeStatus = { hasPending: false, pendingCount: 0, processed: true };
      return;
    }

    // 检查唤醒配置
    const configPath = path.join(openSkillsDir, 'config.json');
    let wakeEnabled = false;
    try {
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        wakeEnabled = config.wake?.enabled ?? false;
      }
    } catch {
      // 忽略配置读取错误
    }

    const wakePendingPath = path.join(openSkillsDir, 'wake', 'pending.json');
    if (!fs.existsSync(wakePendingPath)) {
      // 如果唤醒已禁用，状态为正常
      // 如果唤醒已启用但没有 pending.json，也视为正常（无待处理项）
      this.wakeStatus = { hasPending: false, pendingCount: 0, processed: true };
      return;
    }

    try {
      const wakeContent = fs.readFileSync(wakePendingPath, 'utf-8');
      const wake = JSON.parse(wakeContent);
      
      // 优先使用 processed 标记判断是否已处理（更可靠）
      const processed = wake.processed === true;
      const pendingCount = wake.pendingCount || 0;
      
      // 如果有待处理提案且未处理，则标记为需要唤醒
      const hasPending = pendingCount > 0 && !processed;

      this.wakeStatus = { hasPending, pendingCount, processed };
    } catch (error) {
      // 文件存在但无法解析，可能是损坏的 JSON
      // 这种情况下，我们假设有异常，但不阻止其他功能
      this.wakeStatus = { hasPending: false, pendingCount: 0, processed: true };
    }
  }

  /**
   * 刷新状态
   */
  async refresh(): Promise<void> {
    const client = getApiClient();
    
    // 检查 API 状态
    this.apiAvailable = await client.checkHealth();
    
    if (this.apiAvailable) {
      // 获取配置
      const configResponse = await client.getConfig();
      if (configResponse.success && configResponse.data) {
        this.adminMode = configResponse.data.adminMode;
      }
      
      // 获取 pending 数量
      const proposalsResponse = await client.getProposals({ status: 'pending' });
      if (proposalsResponse.success) {
        this.pendingCount = proposalsResponse.total;
      }
    }
    
    // 检查 skills-admin 状态
    this.checkSkillsAdminStatus();
    
    // 检查唤醒状态
    this.checkWakeStatus();
    
    this.update();
  }

  /**
   * 显示状态栏
   */
  show(): void {
    this.statusBarItem.show();
  }

  /**
   * 隐藏状态栏
   */
  hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
