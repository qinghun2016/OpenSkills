/**
 * 诊断命令
 * 全面检查系统状态并提供修复建议
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getWorkspaceRoot,
  getOpenSkillsDir,
  getConfigPath,
  getProposalsDir,
  getSkillsAdminPath,
  getUserSkillsDir
} from '../utils/paths';
import { getApiClient } from '../api/client';
import { checkAgentCliAvailable } from '../utils/agentCli';
import { performHealthCheck } from './healthCheck';
import { getOutputChannel } from '../outputChannel';

interface DiagnoseResult {
  timestamp: string;
  workspaceRoot: string | undefined;
  components: {
    workspace: { status: 'ok' | 'error'; message: string; details?: any };
    openSkillsDir: { status: 'ok' | 'error'; message: string; details?: any };
    config: { status: 'ok' | 'error' | 'warning'; message: string; details?: any };
    skillsAdmin: { status: 'ok' | 'error' | 'warning'; message: string; details?: any };
    agentCli: { status: 'ok' | 'error' | 'warning'; message: string; details?: any };
    api: { status: 'ok' | 'error' | 'warning'; message: string; details?: any };
    proposals: { status: 'ok' | 'error' | 'warning'; message: string; details?: any };
    wake: { status: 'ok' | 'error' | 'warning'; message: string; details?: any };
  };
  recommendations: string[];
  canAutoFix: boolean;
}

/**
 * 执行完整诊断（带输出通道）
 */
async function performDiagnosisWithOutput(outputChannel?: vscode.OutputChannel): Promise<DiagnoseResult> {
  return performDiagnosis(outputChannel);
}

/**
 * 执行完整诊断
 */
async function performDiagnosis(outputChannel?: vscode.OutputChannel): Promise<DiagnoseResult> {
  const timestamp = new Date().toISOString();
  const recommendations: string[] = [];
  const components: DiagnoseResult['components'] = {
    workspace: { status: 'error', message: '' },
    openSkillsDir: { status: 'error', message: '' },
    config: { status: 'error', message: '' },
    skillsAdmin: { status: 'error', message: '' },
    agentCli: { status: 'warning', message: '' },
    api: { status: 'warning', message: '' },
    proposals: { status: 'ok', message: '' },
    wake: { status: 'ok', message: '' }
  };

  // 1. 检查工作区
  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    components.workspace = { status: 'ok', message: `工作区: ${workspaceRoot}` };
  } else {
    components.workspace = { status: 'error', message: '未检测到工作区' };
    recommendations.push('请先打开包含 .openskills 的项目文件夹');
    return { timestamp, workspaceRoot, components, recommendations, canAutoFix: false };
  }

  // 2. 检查 .openskills 目录
  const openSkillsDir = getOpenSkillsDir();
  if (openSkillsDir && fs.existsSync(openSkillsDir)) {
    components.openSkillsDir = { status: 'ok', message: `.openskills 目录存在: ${openSkillsDir}` };
  } else {
    components.openSkillsDir = { status: 'error', message: '.openskills 目录不存在' };
    recommendations.push('运行 "OpenSkills: Initialize" 命令初始化项目');
    return { timestamp, workspaceRoot, components, recommendations, canAutoFix: true };
  }

  // 3. 检查配置文件
  const configPath = getConfigPath();
  if (configPath && fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      components.config = {
        status: 'ok',
        message: '配置文件存在且有效',
        details: {
          adminMode: config.adminMode || '未设置',
          wakeEnabled: config.wake?.enabled ?? false,
          wakeSchedule: config.wake?.schedule || '未设置'
        }
      };
    } catch (error) {
      components.config = {
        status: 'error',
        message: `配置文件损坏: ${error instanceof Error ? error.message : String(error)}`,
        details: { path: configPath }
      };
      recommendations.push('修复或重新创建 .openskills/config.json');
    }
  } else {
    components.config = { status: 'error', message: '配置文件不存在' };
    recommendations.push('运行 "OpenSkills: Initialize" 命令创建配置文件');
  }

  // 4. 检查 skills-admin Agent
  const healthCheck = await performHealthCheck();
  if (healthCheck.skillsAdminAgentAvailable) {
    // Agent 可用（文件存在 + 已验证 + 不需要重新加载）
    components.skillsAdmin = {
      status: 'ok',
      message: 'skills-admin Agent 可用（文件存在且已被 Cursor 加载）',
      details: {
        path: healthCheck.skillsAdminPath,
        agentAvailable: true
      }
    };
  } else if (healthCheck.skillsAdminFileExists) {
    // 文件存在但 Agent 不可用
    if (healthCheck.needsReload) {
      components.skillsAdmin = {
        status: 'warning',
        message: 'skills-admin 文件存在但 Agent 尚未加载（需要重新加载窗口）',
        details: {
          path: healthCheck.skillsAdminPath,
          needsReload: true,
          agentAvailable: false
        }
      };
      recommendations.push('⚠️ 重要：重新加载 Cursor 窗口以使 skills-admin Agent 生效（Ctrl+Shift+P → Developer: Reload Window）');
    } else if (!healthCheck.skillsAdminVerified) {
      components.skillsAdmin = {
        status: 'error',
        message: 'skills-admin 文件存在但内容不完整或损坏，Agent 不可用',
        details: { 
          path: healthCheck.skillsAdminPath,
          agentAvailable: false
        }
      };
      recommendations.push('运行 "OpenSkills: Health Check" 命令修复 skills-admin 文件');
    } else {
      components.skillsAdmin = {
        status: 'warning',
        message: 'skills-admin 文件存在但 Agent 可能不可用',
        details: {
          path: healthCheck.skillsAdminPath,
          agentAvailable: false
        }
      };
      recommendations.push('如果 Agent 无法使用，尝试重新加载窗口');
    }
  } else {
    // 文件不存在
    components.skillsAdmin = { 
      status: 'error', 
      message: 'skills-admin Agent 不存在（文件不存在）' 
    };
    recommendations.push('运行 "OpenSkills: Health Check" 或 "OpenSkills: Initialize" 命令创建 skills-admin Agent');
  }

  // 5. 检查 Agent CLI
  const cliCheck = await checkAgentCliAvailable(outputChannel);
  if (cliCheck.available) {
    components.agentCli = {
      status: 'ok',
      message: `Cursor Agent CLI 可用${cliCheck.version ? ` (${cliCheck.version})` : ''}`,
      details: { version: cliCheck.version }
    };
  } else {
    components.agentCli = {
      status: 'warning',
      message: `Cursor Agent CLI 不可用: ${cliCheck.errorDetails || cliCheck.error || '未知错误'}`,
      details: { error: cliCheck.error, errorDetails: cliCheck.errorDetails }
    };
    recommendations.push('安装 Cursor Agent CLI 以启用自动唤醒功能（curl https://cursor.com/install -fsSL | bash）');
  }

  // 6. 检查 API
  try {
    const client = getApiClient();
    const apiHealth = await client.checkHealth();
    if (apiHealth) {
      components.api = { status: 'ok', message: 'API 服务可用' };
    } else {
      components.api = {
        status: 'warning',
        message: 'API 服务不可用',
        details: { note: '某些功能可能受限，但不影响基本功能' }
      };
      recommendations.push('启动 API 服务: npm run dev（或启用插件的「自动启动服务」）');
    }
  } catch (error) {
    components.api = {
      status: 'warning',
      message: `API 检查失败: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: error instanceof Error ? error.message : String(error) }
    };
  }

  // 7. 检查 proposals
  const proposalsDir = getProposalsDir();
  if (proposalsDir && fs.existsSync(proposalsDir)) {
    try {
      const proposalFiles = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
      const pendingCount = proposalFiles.filter(f => {
        try {
          const content = fs.readFileSync(path.join(proposalsDir, f), 'utf-8');
          const proposal = JSON.parse(content);
          return proposal.status === 'pending';
        } catch {
          return false;
        }
      }).length;

      components.proposals = {
        status: pendingCount > 0 ? 'warning' : 'ok',
        message: `Proposals 目录正常，${pendingCount} 个待处理提案`,
        details: { total: proposalFiles.length, pending: pendingCount }
      };

      if (pendingCount > 0) {
        recommendations.push(`有 ${pendingCount} 个待处理提案，运行 "OpenSkills: Trigger Wake" 触发审查`);
      }
    } catch (error) {
      components.proposals = {
        status: 'error',
        message: `无法读取 proposals 目录: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  } else {
    components.proposals = { status: 'error', message: 'Proposals 目录不存在' };
  }

  // 8. 检查唤醒机制
  const wakePendingPath = path.join(openSkillsDir!, 'wake', 'pending.json');
  if (fs.existsSync(wakePendingPath)) {
    try {
      const wakeContent = fs.readFileSync(wakePendingPath, 'utf-8');
      const wake = JSON.parse(wakeContent);
      const isProcessed = wake.processed === true;
      const hasPending = wake.pendingCount && wake.pendingCount > 0;

      if (isProcessed) {
        components.wake = {
          status: 'ok',
          message: '唤醒机制正常，pending.json 已处理',
          details: { processed: true, processedAt: wake.processedAt }
        };
      } else if (hasPending) {
        components.wake = {
          status: 'warning',
          message: `有 ${wake.pendingCount} 个待处理提案需要唤醒`,
          details: { pendingCount: wake.pendingCount, timestamp: wake.timestamp }
        };
        recommendations.push('运行 "OpenSkills: Trigger Wake" 触发自动审查');
      } else {
        components.wake = {
          status: 'ok',
          message: '唤醒机制正常，无待处理项',
          details: { pendingCount: 0 }
        };
      }
    } catch (error) {
      components.wake = {
        status: 'error',
        message: `无法读取 wake/pending.json: ${error instanceof Error ? error.message : String(error)}`
      };
      recommendations.push('检查并修复 .openskills/wake/pending.json 文件');
    }
  } else {
    components.wake = { status: 'ok', message: '唤醒机制正常，无待触发的唤醒' };
  }

  const canAutoFix = recommendations.some(rec =>
    rec.includes('Initialize') || rec.includes('Health Check') || rec.includes('重新加载')
  );

  return { timestamp, workspaceRoot, components, recommendations, canAutoFix };
}

/**
 * 注册诊断命令
 */
export function registerDiagnoseCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.diagnose', async () => {
    // 复用全局输出通道（与 extension 同一单例）
    const outputChannel = getOutputChannel();
    outputChannel.show();
    outputChannel.appendLine('=== OpenSkills 系统诊断 ===\n');
    outputChannel.appendLine(`诊断时间: ${new Date().toLocaleString()}\n`);

    // 显示进度
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在诊断系统...',
        cancellable: false
      },
      async progress => {
        progress.report({ message: '检查工作区和配置...' });
        // 使用全局输出通道用于诊断过程中的日志
        const result = await performDiagnosisWithOutput(outputChannel);

        // 显示诊断结果
        outputChannel.appendLine('## 诊断结果\n');

        // 按组件显示
        const componentNames: Record<keyof typeof result.components, string> = {
          workspace: '工作区',
          openSkillsDir: '.openskills 目录',
          config: '配置文件',
          skillsAdmin: 'Skills Admin',
          agentCli: 'Agent CLI',
          api: 'API 服务',
          proposals: 'Proposals',
          wake: '唤醒机制'
        };

        for (const [key, component] of Object.entries(result.components)) {
          const name = componentNames[key as keyof typeof componentNames];
          const comp = component as { status: string; message: string; details?: any };
          const statusIcon = comp.status === 'ok' ? '✅' : comp.status === 'warning' ? '⚠️' : '❌';
          outputChannel.appendLine(`${statusIcon} ${name}: ${comp.message}`);
          if (comp.details) {
            outputChannel.appendLine(`   详情: ${JSON.stringify(comp.details, null, 2).replace(/\n/g, '\n   ')}`);
          }
        }

        // 显示建议
        if (result.recommendations.length > 0) {
          outputChannel.appendLine('\n## 修复建议\n');
          result.recommendations.forEach((rec, index) => {
            outputChannel.appendLine(`${index + 1}. ${rec}`);
          });
        } else {
          outputChannel.appendLine('\n✅ 所有组件状态正常，无需修复');
        }

        // 提供快速操作
        if (result.recommendations.length > 0) {
          outputChannel.appendLine('\n## 快速操作\n');
          
          const actions: string[] = [];
          if (result.recommendations.some(r => r.includes('Initialize'))) {
            actions.push('运行初始化');
          }
          if (result.recommendations.some(r => r.includes('Health Check'))) {
            actions.push('运行健康检查');
          }
          if (result.recommendations.some(r => r.includes('Trigger Wake'))) {
            actions.push('触发唤醒');
          }
          if (result.recommendations.some(r => r.includes('重新加载'))) {
            actions.push('重新加载窗口');
          }

          if (actions.length > 0) {
            const selectedAction = await vscode.window.showInformationMessage(
              `诊断完成。发现 ${result.recommendations.length} 个问题。是否执行修复？`,
              ...actions,
              '查看详情'
            );

            if (selectedAction === '运行初始化') {
              await vscode.commands.executeCommand('openskills.init');
            } else if (selectedAction === '运行健康检查') {
              await vscode.commands.executeCommand('openskills.healthCheck');
            } else if (selectedAction === '触发唤醒') {
              await vscode.commands.executeCommand('openskills.triggerWake');
            } else if (selectedAction === '重新加载窗口') {
              await vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else if (selectedAction === '查看详情') {
              outputChannel.show();
            }
          }
        } else {
          vscode.window.showInformationMessage('✅ 系统诊断完成：所有组件状态正常');
        }

        outputChannel.appendLine('\n=== 诊断完成 ===');
      }
    );
  });
}
