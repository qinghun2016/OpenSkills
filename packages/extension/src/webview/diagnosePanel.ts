/**
 * OpenSkills 诊断面板
 * 提供直观的系统状态查看和修复界面
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getWorkspaceRoot,
  getOpenSkillsDir,
  getConfigPath,
  getProposalsDir,
  getSkillsAdminPath
} from '../utils/paths';
import { getApiClient } from '../api/client';
import { checkAgentCliAvailable } from '../commands/triggerWake';
import { performHealthCheck } from '../commands/healthCheck';
import { getLastSkillsAdminInitResult } from '../extension';
import { getOutputChannel } from '../outputChannel';

export class DiagnosePanel {
  public static currentPanel: DiagnosePanel | undefined;
  public static readonly viewType = 'openskills.diagnose';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // 设置 HTML 内容
    this._update();

    // 监听面板关闭
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // 监听面板状态变化
    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );

    // 处理来自 webview 的消息
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'refresh':
            this._update();
            break;
          case 'runHealthCheck':
            await vscode.commands.executeCommand('openskills.healthCheck');
            this._update();
            break;
          case 'runDiagnose':
            await vscode.commands.executeCommand('openskills.diagnose');
            this._update();
            break;
          case 'triggerWake':
            try {
              vscode.window.showInformationMessage('正在触发唤醒...', { modal: false });
              await vscode.commands.executeCommand('openskills.triggerWake');
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              vscode.window.showErrorMessage(`触发唤醒失败: ${msg}`);
            }
            this._update();
            break;
          case 'init':
            await vscode.commands.executeCommand('openskills.init');
            this._update();
            break;
          case 'reloadWindow':
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
            break;
          case 'openSettings':
            await vscode.commands.executeCommand('workbench.action.openSettings', 'openskills');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * 创建或显示面板
   */
  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // 如果已存在面板，显示它
    if (DiagnosePanel.currentPanel) {
      DiagnosePanel.currentPanel._panel.reveal(column);
      DiagnosePanel.currentPanel._update();
      return;
    }

    // 创建新面板
    const panel = vscode.window.createWebviewPanel(
      DiagnosePanel.viewType,
      'OpenSkills 系统诊断',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    DiagnosePanel.currentPanel = new DiagnosePanel(panel, extensionUri);
  }

  /**
   * 刷新面板
   */
  public static refresh() {
    if (DiagnosePanel.currentPanel) {
      DiagnosePanel.currentPanel._update();
    }
  }

  /**
   * 释放资源
   */
  public dispose() {
    DiagnosePanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  /**
   * 更新面板内容
   */
  private async _update(): Promise<void> {
    try {
      const webview = this._panel.webview;
      const data = await this._getDiagnosisData();
      this._panel.webview.html = this._getHtmlForWebview(webview, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const out = getOutputChannel();
      out.appendLine(`[DiagnosePanel _update] 错误: ${msg}`);
      if (e instanceof Error && e.stack) out.appendLine(e.stack);
    }
  }

  /**
   * 获取诊断数据
   */
  private async _getDiagnosisData(): Promise<{
    workspaceRoot: string | undefined;
    skillsAdmin: Awaited<ReturnType<typeof performHealthCheck>>;
    skillsAdminInitResult: ReturnType<typeof getLastSkillsAdminInitResult>;
    agentCli: Awaited<ReturnType<typeof checkAgentCliAvailable>>;
    apiAvailable: boolean;
    proposals: { total: number; pending: number };
    wake: { hasPending: boolean; pendingCount: number; processed: boolean };
    config: { adminMode?: string; wakeEnabled?: boolean } | null;
  }> {
    const workspaceRoot = getWorkspaceRoot();
    const skillsAdmin = await performHealthCheck();
    const skillsAdminInitResult = getLastSkillsAdminInitResult();
    const agentCli = await checkAgentCliAvailable();
    const client = getApiClient();
    const apiAvailable = await client.checkHealth();

    // 检查 proposals
    let proposals = { total: 0, pending: 0 };
    const proposalsDir = getProposalsDir();
    if (proposalsDir && fs.existsSync(proposalsDir)) {
      try {
        const files = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
        proposals.total = files.length;
        proposals.pending = files.filter(f => {
          try {
            const content = fs.readFileSync(path.join(proposalsDir, f), 'utf-8');
            const proposal = JSON.parse(content);
            return proposal.status === 'pending';
          } catch {
            return false;
          }
        }).length;
      } catch {}
    }

    // 检查唤醒状态
    let wake = { hasPending: false, pendingCount: 0, processed: true };
    const openSkillsDir = getOpenSkillsDir();
    if (openSkillsDir) {
      const wakePendingPath = path.join(openSkillsDir, 'wake', 'pending.json');
      if (fs.existsSync(wakePendingPath)) {
        try {
          const wakeContent = fs.readFileSync(wakePendingPath, 'utf-8');
          const wakeData = JSON.parse(wakeContent);
          wake = {
            hasPending: (wakeData.pendingCount || 0) > 0 && wakeData.processed !== true,
            pendingCount: wakeData.pendingCount || 0,
            processed: wakeData.processed === true
          };
        } catch {}
      }
    }

    // 读取配置
    let config: { adminMode?: string; wakeEnabled?: boolean } | null = null;
    const configPath = getConfigPath();
    if (configPath && fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
      } catch {}
    }

    return {
      workspaceRoot,
      skillsAdmin,
      skillsAdminInitResult,
      agentCli,
      apiAvailable,
      proposals,
      wake,
      config
    };
  }

  /**
   * 生成 HTML
   */
  private _getHtmlForWebview(webview: vscode.Webview, data: Awaited<ReturnType<typeof this._getDiagnosisData>>): string {
    const nonce = getNonce();

    // Skills Admin Agent 卡片：结合健康检查与启动时初始化结果，未就绪时显示失败原因
    const init = data.skillsAdminInitResult;
    const hasInitError = !!init?.initErrorMessage;
    const hasAutoStartError = !!init?.autoStartAttempted && !init?.autoStartOk && !!init?.autoStartErrorMessage;
    const agentTrulyReady = data.skillsAdmin.skillsAdminAgentAvailable && !hasInitError && (!init?.autoStartAttempted || init?.autoStartOk);
    const skillsAdminCardClass = hasInitError || !data.skillsAdmin.skillsAdminFileExists ? 'error' : (agentTrulyReady ? 'healthy' : 'warning');
    const skillsAdminStatusIcon = agentTrulyReady ? '✅' : (data.skillsAdmin.skillsAdminFileExists || hasInitError ? '⚠️' : '❌');
    let skillsAdminMessage = '';
    if (hasInitError) {
      skillsAdminMessage = `❌ 初始化失败：${escapeHtml(init!.initErrorMessage!)}`;
    } else if (hasAutoStartError) {
      skillsAdminMessage = `⚠️ 定义已就绪，但自动启动 Agent 失败：${escapeHtml(init!.autoStartErrorMessage!)}。当前仅有 Agent 定义，无真正进程。`;
    } else if (data.skillsAdmin.skillsAdminAgentAvailable) {
      skillsAdminMessage = 'Skill 已就绪（文件存在且已被 Cursor 加载）';
    } else if (data.skillsAdmin.skillsAdminFileExists) {
      skillsAdminMessage = data.skillsAdmin.needsReload
        ? '⚠️ 文件存在但 Cursor 可能尚未加载。请重新加载窗口后重试。'
        : data.skillsAdmin.skillsAdminVerified
          ? '文件存在但 Cursor 可能尚未加载（建议重新加载窗口后重试）'
          : '文件存在但内容损坏，Skill 不可用';
    } else {
      skillsAdminMessage = 'Skill 不存在（文件不存在，需要创建）';
    }
    const skillsAdminInitResultBlock = (init && (init.initErrorMessage || init.autoStartErrorMessage))
      ? `<div class="info-row" style="margin-top: 8px; padding: 8px; background: var(--vscode-inputValidation-errorBackground); border-left: 4px solid var(--error-color); border-radius: 4px; font-size: 12px;">
        <div style="font-weight: 600; margin-bottom: 4px;">上次启动时初始化结果</div>
        ${init.initErrorMessage ? `<div>• 初始化失败：${escapeHtml(init.initErrorMessage)}</div>` : ''}
        ${init.autoStartErrorMessage ? `<div>• 自动启动失败：${escapeHtml(init.autoStartErrorMessage)}</div>` : ''}
      </div>`
      : '';

    // 计算总体健康状态（含插件启动时 skills-admin 初始化结果）
    const issues: string[] = [];
    const initResult = data.skillsAdminInitResult;
    if (initResult?.initErrorMessage) {
      issues.push(`skills-admin 初始化失败：${initResult.initErrorMessage}`);
    }
    if (initResult?.autoStartAttempted && !initResult?.autoStartOk && initResult?.autoStartErrorMessage) {
      issues.push(`skills-admin 自动启动失败：${initResult.autoStartErrorMessage}`);
    }
    if (!data.skillsAdmin.skillsAdminFileExists) {
      issues.push('skills-admin Agent 不存在（文件不存在）');
    } else if (!data.skillsAdmin.skillsAdminAgentAvailable) {
      if (data.skillsAdmin.needsReload) {
        issues.push('skills-admin 文件存在但 Agent 尚未加载（需要重新加载窗口）');
      } else if (!data.skillsAdmin.skillsAdminVerified) {
        issues.push('skills-admin 文件存在但内容损坏，Agent 不可用');
      } else {
        issues.push('skills-admin 文件存在但 Agent 可能不可用');
      }
    }
    if (!data.agentCli.available) issues.push('Agent CLI 不可用');
    if (!data.apiAvailable) issues.push('API 未连接');
    if (data.wake.hasPending) issues.push('有待唤醒的提案');
    
    const overallStatus = issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'warning' : 'error';
    const statusIcon = overallStatus === 'healthy' ? '✅' : overallStatus === 'warning' ? '⚠️' : '❌';
    const statusText = overallStatus === 'healthy' ? '系统正常' : overallStatus === 'warning' ? '部分问题' : '需要修复';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>OpenSkills 系统诊断</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --success-color: #4caf50;
      --warning-color: #ff9800;
      --error-color: #f44336;
      --info-color: #2196f3;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      padding: 20px;
      line-height: 1.6;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--border-color);
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .overall-status {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      border: 2px solid ${overallStatus === 'healthy' ? 'var(--success-color)' : overallStatus === 'warning' ? 'var(--warning-color)' : 'var(--error-color)'};
    }

    .overall-status.healthy { border-color: var(--success-color); }
    .overall-status.warning { border-color: var(--warning-color); }
    .overall-status.error { border-color: var(--error-color); }

    .status-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .status-icon {
      font-size: 32px;
    }

    .status-title {
      font-size: 20px;
      font-weight: 600;
    }

    .status-issues {
      margin-top: 12px;
      padding-left: 20px;
    }

    .status-issues li {
      margin: 4px 0;
      color: var(--text-secondary);
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-primary {
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
    }

    .btn-success {
      background: var(--success-color);
      color: #fff;
    }

    .btn-warning {
      background: var(--warning-color);
      color: #fff;
    }

    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .components-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .component-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      position: relative;
    }

    .component-card.healthy {
      border-left: 4px solid var(--success-color);
    }

    .component-card.warning {
      border-left: 4px solid var(--warning-color);
    }

    .component-card.error {
      border-left: 4px solid var(--error-color);
    }

    .component-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .component-title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .component-status {
      font-size: 20px;
    }

    .component-message {
      color: var(--text-secondary);
      font-size: 13px;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .component-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .quick-actions {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-top: 24px;
    }

    .quick-actions h3 {
      margin-bottom: 16px;
      font-size: 16px;
    }

    .quick-actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border-color);
      font-size: 13px;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      color: var(--text-secondary);
    }

    .info-value {
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 OpenSkills 系统诊断</h1>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick="refresh()">🔄 刷新</button>
    </div>
  </div>

  <div class="overall-status ${overallStatus}">
    <div class="status-header">
      <span class="status-icon">${statusIcon}</span>
      <div>
        <div class="status-title">系统状态: ${statusText}</div>
        ${issues.length > 0 ? `
        <div style="margin-top: 8px; color: var(--text-secondary); font-size: 13px;">
          发现 ${issues.length} 个问题
        </div>
        ` : ''}
      </div>
    </div>
    ${issues.length > 0 ? `
    <ul class="status-issues">
      ${issues.map(issue => `<li>• ${escapeHtml(issue)}</li>`).join('')}
    </ul>
    ` : '<div style="color: var(--success-color); font-weight: 500;">✅ 所有组件运行正常</div>'}
  </div>

  <div class="components-grid">
    <!-- Skills Admin Agent（结合健康检查与启动时初始化结果，未就绪时显示失败原因） -->
    <div class="component-card ${skillsAdminCardClass}">
      <div class="component-header">
        <div class="component-title">
          Skills Admin Agent
          <span class="component-status">${skillsAdminStatusIcon}</span>
        </div>
      </div>
      <div class="component-message">
        ${skillsAdminMessage}
      </div>
      ${skillsAdminInitResultBlock}
      ${data.skillsAdmin.skillsAdminFileExists ? `
      <div class="info-row" style="margin-top: 8px; padding: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 4px;">
        <div style="font-weight: 600; margin-bottom: 4px;">Cursor 中 Agent 与 Skill 的区别</div>
        <ul style="margin: 0; padding-left: 18px; font-size: 12px;">
          <li><b>Agent 列表</b>（子 Agent）：来自 <code>.cursor/agents/*.md</code>，扩展已创建 <code>.cursor/agents/skills-admin.md</code>，重载窗口后可在 Agent 工具/列表里看到 skills-admin</li>
          <li><b>Skill</b>（领域能力）：来自 <code>.cursor/skills/*/SKILL.md</code>，在对话里输入 <code>/</code> 或 设置 → Rules → Agent Decides 中可见</li>
        </ul>
      </div>
      ` : ''}
      ${data.skillsAdmin.skillsAdminPath ? `
      <div class="info-row">
        <span class="info-label">路径:</span>
        <span class="info-value" style="font-size: 11px; word-break: break-all;">${escapeHtml(data.skillsAdmin.skillsAdminPath)}</span>
      </div>
      ` : ''}
      <div class="component-actions">
        ${!data.skillsAdmin.skillsAdminFileExists ? `
        <button class="btn btn-primary" onclick="runHealthCheck()">创建 Agent</button>
        ` : ''}
        ${data.skillsAdmin.needsReload ? `
        <button class="btn btn-warning" onclick="reloadWindow()">重新加载窗口（必须）</button>
        ` : ''}
        ${data.skillsAdmin.skillsAdminFileExists && !data.skillsAdmin.skillsAdminAgentAvailable && !data.skillsAdmin.needsReload ? `
        <button class="btn btn-warning" onclick="reloadWindow()">尝试重新加载</button>
        ` : ''}
        <button class="btn btn-secondary" onclick="runHealthCheck()">健康检查</button>
      </div>
    </div>

    <!-- Agent CLI -->
    <div class="component-card ${data.agentCli.available ? 'healthy' : 'warning'}">
      <div class="component-header">
        <div class="component-title">
          Agent CLI
          <span class="component-status">${data.agentCli.available ? '✅' : '⚠️'}</span>
        </div>
      </div>
      <div class="component-message">
        ${data.agentCli.available 
          ? `已安装${data.agentCli.version ? ` (${escapeHtml(data.agentCli.version)})` : ''}`
          : data.agentCli.errorDetails || '未安装或不可用'}
      </div>
      ${data.agentCli.version ? `
      <div class="info-row">
        <span class="info-label">版本:</span>
        <span class="info-value">${escapeHtml(data.agentCli.version)}</span>
      </div>
      ` : ''}
      <div class="component-actions">
        ${!data.agentCli.available ? `
        <button class="btn btn-secondary" onclick="openSettings()">查看安装指南</button>
        ` : ''}
      </div>
    </div>

    <!-- API 服务 -->
    <div class="component-card ${data.apiAvailable ? 'healthy' : 'warning'}">
      <div class="component-header">
        <div class="component-title">
          API 服务
          <span class="component-status">${data.apiAvailable ? '✅' : '⚠️'}</span>
        </div>
      </div>
      <div class="component-message">
        ${data.apiAvailable ? '已连接' : '未连接（某些功能可能受限）'}
      </div>
    </div>

    <!-- Proposals -->
    <div class="component-card ${data.proposals.pending > 0 ? 'warning' : 'healthy'}">
      <div class="component-header">
        <div class="component-title">
          Proposals
          <span class="component-status">${data.proposals.pending > 0 ? '⚠️' : '✅'}</span>
        </div>
      </div>
      <div class="component-message">
        总计: ${data.proposals.total} | 待处理: ${data.proposals.pending}
      </div>
      ${data.proposals.pending > 0 ? `
      <div class="component-actions">
        <button class="btn btn-primary" onclick="triggerWake()">触发唤醒</button>
      </div>
      ` : ''}
    </div>

    <!-- 唤醒机制 -->
    <div class="component-card ${data.wake.hasPending ? 'warning' : 'healthy'}">
      <div class="component-header">
        <div class="component-title">
          唤醒机制
          <span class="component-status">${data.wake.hasPending ? '⚠️' : '✅'}</span>
        </div>
      </div>
      <div class="component-message">
        ${data.wake.hasPending 
          ? `${data.wake.pendingCount} 个待处理提案需要唤醒`
          : data.wake.processed 
            ? '已处理，无待唤醒项'
            : '正常，无待唤醒项'}
      </div>
      ${data.wake.hasPending ? `
      <div class="component-actions">
        <button class="btn btn-primary" onclick="triggerWake()">立即唤醒</button>
      </div>
      ` : ''}
    </div>

    <!-- 配置 -->
    ${data.config ? `
    <div class="component-card healthy">
      <div class="component-header">
        <div class="component-title">
          配置
          <span class="component-status">✅</span>
        </div>
      </div>
      <div class="info-row">
        <span class="info-label">Admin Mode:</span>
        <span class="info-value">${escapeHtml(data.config.adminMode || '未设置')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Wake Enabled:</span>
        <span class="info-value">${data.config.wakeEnabled ? '是' : '否'}</span>
      </div>
    </div>
    ` : ''}
  </div>

  <div class="quick-actions">
    <h3>🚀 快速操作</h3>
    <div class="quick-actions-grid">
      <button class="btn btn-primary" onclick="runHealthCheck()">健康检查</button>
      <button class="btn btn-primary" onclick="runDiagnose()">完整诊断</button>
      <button class="btn btn-success" onclick="triggerWake()">触发唤醒</button>
      <button class="btn btn-secondary" onclick="init()">初始化项目</button>
      <button class="btn btn-secondary" onclick="openSettings()">打开设置</button>
      <button class="btn btn-secondary" onclick="refresh()">刷新状态</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function runHealthCheck() {
      vscode.postMessage({ command: 'runHealthCheck' });
    }

    function runDiagnose() {
      vscode.postMessage({ command: 'runDiagnose' });
    }

    function triggerWake() {
      vscode.postMessage({ command: 'triggerWake' });
    }

    function init() {
      vscode.postMessage({ command: 'init' });
    }

    function reloadWindow() {
      vscode.postMessage({ command: 'reloadWindow' });
    }

    function openSettings() {
      vscode.postMessage({ command: 'openSettings' });
    }

    // 自动刷新（每30秒）
    setInterval(() => {
      refresh();
    }, 30000);
  </script>
</body>
</html>`;
  }
}

/**
 * 生成随机 nonce
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 注册打开诊断面板命令
 */
export function registerOpenDiagnosePanelCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.openDiagnosePanel', () => {
    DiagnosePanel.createOrShow(context.extensionUri);
  });
}
