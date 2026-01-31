/**
 * 触发唤醒命令
 * 真正「唤醒」= 通过 Cursor Agent CLI 启动 Cursor Agent 跑 skills-admin。
 * 若未启用 CLI 或未安装，则仅调 API 记录 + 提示手动开聊天。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getApiClient } from '../api/client';
import {
  getWorkspaceRoot,
  getConfigPath,
  getOpenSkillsDir,
  readJsonFile
} from '../utils/paths';
import {
  checkAgentCliAvailable as checkAgentCliAvailableFromUtils,
  ensureWakeDependencies,
  executeAgentChatInTerminal,
  executeAgentInBackground
} from '../utils/agentCli';
import { getOutputChannel, getOpenSkillsAdminChannel } from '../outputChannel';

const DEFAULT_WAKE_PROMPT =
  '担任 skills-admin：请立即执行全部步骤（run-everything），无需等待用户确认。先调用 GET /api/scheduler/handoff/snapshot，若有交接快照则从断点继续；否则先执行 skill-proposer 分析 skills 并生成 proposals，再审查所有 pending proposals。';

/**
 * 检测 Cursor Agent CLI 是否可用（重新导出，保持向后兼容）
 */
export async function checkAgentCliAvailable() {
  return checkAgentCliAvailableFromUtils();
}

/** 自动启动 Agent 的结果 */
export interface StartSkillsAdminAgentResult {
  started: boolean;
  error?: 'cli_unavailable' | 'ripgrep_unavailable';
  errorMessage?: string;
}

/**
 * 在终端中自动启动 skills-admin Agent（真正启动进程，而非仅创建定义文件）。
 * 依赖 Cursor Agent CLI 与 ripgrep (rg)；未安装 rg 时 agent chat 会报错，故先检测并提示。
 * @param workspaceRoot 工作区根目录（终端 cwd）
 * @returns 是否已启动及错误信息（若未启动）
 */
export async function startSkillsAdminAgent(workspaceRoot: string): Promise<StartSkillsAdminAgentResult> {
  const cliCheck = await checkAgentCliAvailableFromUtils();
  if (!cliCheck.available) {
    return {
      started: false,
      error: 'cli_unavailable',
      errorMessage: `Cursor Agent CLI 不可用：${cliCheck.errorDetails || cliCheck.error || '未知'}`
    };
  }
  const depResult = await ensureWakeDependencies();
  if (!depResult.allOk) {
    const failed = depResult.results.filter(r => !r.ok);
    const first = failed[0];
    const errorKey = first?.name?.includes('ripgrep') ? 'ripgrep_unavailable' : undefined;
    const errorMessage = failed
      .map(r => `${r.name}: ${r.error || '未安装且自动安装未成功'}`)
      .join('；');
    return {
      started: false,
      error: errorKey,
      errorMessage: errorMessage + '。请按上述提示手动安装后重试。'
    };
  }
  let prompt = resolveWakePrompt().trim();
  const apiBaseUrl = getApiClient().getBaseUrl();
  prompt = `${prompt}\n\n【重要】当前 OpenSkills API 基地址为: ${apiBaseUrl}。请使用该地址调用所有 API（不要使用 localhost:3000）。`.trim();
  const cfg = vscode.workspace.getConfiguration('openskills');
  const forceAllow = cfg.get<boolean>('wakeForceAllowCommands', true);
  const usePrintMode = cfg.get<boolean>('wakeUsePrintMode', true);
  const timeoutMinutes = Math.min(240, Math.max(5, cfg.get<number>('wakeAgentTimeoutMinutes', 45)));
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const outputFormat = (cfg.get<string>('wakeOutputFormat', 'text') === 'stream-json' ? 'stream-json' : 'text') as 'text' | 'stream-json';
  if (usePrintMode) {
    executeAgentInBackground(prompt, workspaceRoot, cliCheck.resolvedPath, { OPENSKILLS_API_URL: apiBaseUrl }, forceAllow, timeoutMs, outputFormat);
  } else {
    const terminal = executeAgentChatInTerminal(prompt, workspaceRoot, 'OpenSkills Wake', cliCheck.resolvedPath, { OPENSKILLS_API_URL: apiBaseUrl }, forceAllow, false);
    const timeoutId = setTimeout(() => {
      try { terminal.dispose(); } catch (_e) { /* ignore */ }
    }, timeoutMs);
    const closeSub = vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) {
        clearTimeout(timeoutId);
        closeSub.dispose();
      }
    });
  }
  return { started: true };
}

// isAgentCliAvailable 函数已移除，统一使用 checkAgentCliAvailable

/**
 * 唤醒诊断接口
 */
export interface WakeDiagnosis {
  hasPending: boolean;
  pendingCount: number;
  processed: boolean;
  processedAt?: string;
  timestamp?: string;
  agentCliAvailable: boolean;
  agentCliError?: string;
  recommendations: string[];
}

/**
 * 执行唤醒诊断
 * 检查 wake/pending.json 状态、Agent CLI 可用性等
 */
export async function diagnoseWake(): Promise<WakeDiagnosis> {
  const workspaceRoot = getWorkspaceRoot();
  const openSkillsDir = getOpenSkillsDir();
  const recommendations: string[] = [];
  
  // 检查工作区
  if (!workspaceRoot || !openSkillsDir) {
    recommendations.push('请先打开包含 .openskills 的项目文件夹');
    return {
      hasPending: false,
      pendingCount: 0,
      processed: true,
      agentCliAvailable: false,
      recommendations
    };
  }

  // 检查 wake/pending.json
  const wakePendingPath = path.join(openSkillsDir, 'wake', 'pending.json');
  let hasPending = false;
  let pendingCount = 0;
  let processed = true;
  let processedAt: string | undefined;
  let timestamp: string | undefined;

  if (fs.existsSync(wakePendingPath)) {
    try {
      const wakeContent = fs.readFileSync(wakePendingPath, 'utf-8');
      const wake = JSON.parse(wakeContent);
      
      processed = wake.processed === true;
      pendingCount = wake.pendingCount || 0;
      hasPending = pendingCount > 0 && !processed;
      processedAt = wake.processedAt;
      timestamp = wake.timestamp;

      if (hasPending) {
        recommendations.push(`有 ${pendingCount} 个待处理提案，运行 "OpenSkills: Trigger Wake" 触发自动审查`);
      } else if (processed) {
        recommendations.push('唤醒机制正常，pending.json 已处理');
      }
    } catch (error) {
      recommendations.push(`无法读取 wake/pending.json: ${error instanceof Error ? error.message : String(error)}`);
      recommendations.push('检查并修复 .openskills/wake/pending.json 文件');
    }
  } else {
    recommendations.push('唤醒机制正常，无待触发的唤醒');
  }

  // 检查 Agent CLI
  const cliCheck = await checkAgentCliAvailable();
  if (!cliCheck.available) {
    recommendations.push(`Cursor Agent CLI 不可用: ${cliCheck.errorDetails || cliCheck.error || '未知错误'}`);
    recommendations.push('安装 Cursor Agent CLI 以启用自动唤醒功能（curl https://cursor.com/install -fsSL | bash）');
  }

  return {
    hasPending,
    pendingCount,
    processed,
    processedAt,
    timestamp,
    agentCliAvailable: cliCheck.available,
    agentCliError: cliCheck.available ? undefined : (cliCheck.errorDetails || cliCheck.error),
    recommendations
  };
}

/**
 * 解析唤醒用 prompt：优先扩展配置 > config.json wake.reminderPrompt > 默认
 */
function resolveWakePrompt(): string {
  const cfg = vscode.workspace.getConfiguration('openskills');
  const custom = cfg.get<string>('wakeAgentPrompt', '').trim();
  if (custom) return custom;

  const configPath = getConfigPath();
  const raw = configPath ? readJsonFile<{ wake?: { reminderPrompt?: string } }>(configPath) : undefined;
  const fromConfig = raw?.wake?.reminderPrompt?.trim();
  if (fromConfig) return fromConfig;

  return DEFAULT_WAKE_PROMPT.trim();
}

/**
 * 注册触发唤醒命令
 */
export function registerTriggerWakeCommand(_context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.triggerWake', async () => {
    const client = getApiClient();
    client.updateBaseUrl(); // 确保使用当前配置/内嵌服务端口，避免仍请求 3000
    const workspaceRoot = getWorkspaceRoot();
    const cfg = vscode.workspace.getConfiguration('openskills');
    const useAgentCli = cfg.get<boolean>('wakeUseAgentCli', true);

    let prompt = resolveWakePrompt().trim();
    const apiBaseUrl = client.getBaseUrl();
    prompt = `${prompt}\n\n【重要】当前 OpenSkills API 基地址为: ${apiBaseUrl}。请使用该地址调用所有 API（不要使用 localhost:3000）。`.trim();

    /** 可选：调 API 记录 wake，失败不阻塞 */
    const triggerApi = async (): Promise<void> => {
      try {
        if (await client.checkHealth()) {
          await client.triggerWake();
        }
      } catch {
        // 忽略，不阻塞 CLI 唤醒
      }
    };

    /** 刷新视图 */
    const refresh = (): void => {
      vscode.commands.executeCommand('openskills.refresh');
    };

    const outputChannel = getOutputChannel();

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '触发唤醒',
          cancellable: false
        },
        async progress => {
          progress.report({ message: '正在触发 API...' });
          try {
            await triggerApi();
            if (outputChannel) {
              outputChannel.appendLine('[触发唤醒] API 调用成功');
            }
          } catch (apiError) {
            const apiErrorMsg = apiError instanceof Error ? apiError.message : String(apiError);
            if (outputChannel) {
              outputChannel.appendLine(`[触发唤醒] API 调用失败（不影响 CLI 唤醒）: ${apiErrorMsg}`);
            }
            // API 失败不影响后续 CLI 唤醒
          }
          
          refresh();

          if (!useAgentCli) {
            vscode.window.showInformationMessage(
              '已触发 API 唤醒。请手动在 Cursor 聊天输入「审查建议」或启用 openskills.wakeUseAgentCli 并安装 Cursor CLI 以自动启动 Agent。'
            );
            return;
          }

          if (!workspaceRoot) {
            vscode.window.showWarningMessage(
              '触发唤醒需要打开包含 .openskills 的工作区。请打开项目文件夹后重试。'
            );
            return;
          }

          // 执行详细的 CLI 检测
          progress.report({ message: '检测 Cursor Agent CLI...' });
          const cliCheck = await checkAgentCliAvailable();
    
    if (!cliCheck.available) {
      const outputChannel = getOutputChannel();
      outputChannel.appendLine('[触发唤醒] Cursor Agent CLI 检测失败');
      outputChannel.appendLine(`错误: ${cliCheck.error || '未知错误'}`);
      if (cliCheck.errorDetails) {
        outputChannel.appendLine(`详情: ${cliCheck.errorDetails}`);
      }
      outputChannel.appendLine('\n解决方案：');
      outputChannel.appendLine('1. 安装 Cursor Agent CLI：');
      outputChannel.appendLine('   - macOS/Linux/WSL: curl https://cursor.com/install -fsSL | bash');
      outputChannel.appendLine('   - Windows (Git Bash): 同上');
      outputChannel.appendLine('   - 将 ~/.local/bin 加入 PATH');
      outputChannel.appendLine('   - 验证: agent --version');
      outputChannel.appendLine('2. 或手动唤醒：在 Cursor 聊天输入「审查建议」或「review proposals」');
      outputChannel.appendLine('3. 详细指南：查看 QUICK_REFERENCE.md 中的「Cursor Agent CLI 安装」章节');
      outputChannel.show();
      
      const action = await vscode.window.showWarningMessage(
        `未检测到 Cursor Agent CLI。${cliCheck.errorDetails || ''}`,
        '查看安装指南',
        '查看详细错误',
        '手动唤醒',
        '取消'
      );
      
      if (action === '查看安装指南') {
        vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/docs/cli/installation'));
        vscode.window.showInformationMessage(
          '安装后请重启 Cursor 或重新加载窗口（Ctrl+Shift+P → "Developer: Reload Window"）'
        );
      } else if (action === '查看详细错误') {
        outputChannel.show();
      } else if (action === '手动唤醒') {
        vscode.window.showInformationMessage(
          '请在 Cursor 聊天中输入：「审查建议」或「review proposals」或「担任管理员」',
          '知道了'
        );
      }
      
      return;
    }
    
          // CLI 可用，显示版本信息
          if (outputChannel) {
            outputChannel.appendLine(`[触发唤醒] Cursor Agent CLI 检测成功${cliCheck.version ? ` (${cliCheck.version})` : ''}`);
          }

          // 确保所有唤醒依赖可用（如 ripgrep）；缺失时按顺序尝试自动安装
          progress.report({ message: '检查并安装所需依赖...' });
          const depResult = await ensureWakeDependencies();
          if (!depResult.allOk) {
            const failed = depResult.results.filter(r => !r.ok);
            for (const r of failed) {
              if (outputChannel) {
                outputChannel.appendLine(`[触发唤醒] 未检测到 ${r.name}，已尝试自动安装`);
                if (r.error) outputChannel.appendLine(`[触发唤醒] ⚠️ ${r.error}`);
              }
            }
            if (outputChannel) outputChannel.show();
            const msg = failed.map(r => `${r.name}: ${r.error || '自动安装未成功'}`).join('；');
            vscode.window.showWarningMessage(
              `启动 Agent 需要以下依赖：${msg}`,
              '查看输出'
            ).then(a => { if (a === '查看输出' && outputChannel) outputChannel.show(); });
            return;
          }
          for (const r of depResult.results) {
            if (r.installed && outputChannel) {
              outputChannel.appendLine(`[触发唤醒] ✅ ${r.name} 已通过 ${r.method || '自动安装'} 安装`);
            }
          }

          progress.report({ message: '向 Cursor Agent 发送唤醒指令...' });
          const forceAllow = cfg.get<boolean>('wakeForceAllowCommands', true);
          const usePrintMode = cfg.get<boolean>('wakeUsePrintMode', true);
          const timeoutMinutes = Math.min(240, Math.max(5, cfg.get<number>('wakeAgentTimeoutMinutes', 45)));
          const timeoutMs = timeoutMinutes * 60 * 1000;
          const outputFormat = (cfg.get<string>('wakeOutputFormat', 'text') === 'stream-json' ? 'stream-json' : 'text') as 'text' | 'stream-json';
          try {
            if (usePrintMode) {
              executeAgentInBackground(
                prompt,
                workspaceRoot,
                cliCheck.resolvedPath,
                { OPENSKILLS_API_URL: apiBaseUrl },
                forceAllow,
                timeoutMs,
                outputFormat
              );
              if (outputChannel) {
                outputChannel.appendLine('[触发唤醒] 已在后台启动 skills-admin Agent，输出见 OpenSkillsAdmin 通道');
              }
              vscode.window.showInformationMessage(
                '已在后台启动 skills-admin Agent，输出见 OpenSkillsAdmin 通道。',
                '查看输出',
                '打开登录说明'
              ).then(action => {
                if (action === '查看输出') {
                  getOpenSkillsAdminChannel().show();
                } else if (action === '打开登录说明') {
                  vscode.commands.executeCommand('openskills.openCliLoginPage');
                }
              });
            } else {
              const terminal = executeAgentChatInTerminal(
                prompt,
                workspaceRoot,
                'OpenSkills Wake',
                cliCheck.resolvedPath,
                { OPENSKILLS_API_URL: apiBaseUrl },
                forceAllow,
                false
              );
              terminal.show();
              const timeoutId = setTimeout(() => {
                try {
                  terminal.dispose();
                  if (outputChannel) {
                    outputChannel.appendLine(`[触发唤醒] 终端已超时（${timeoutMinutes} 分钟）回收`);
                  }
                  vscode.window.showInformationMessage(`OpenSkills Wake 终端已超时回收（${timeoutMinutes} 分钟）`);
                } catch (_e) { /* ignore */ }
              }, timeoutMs);
              const closeSub = vscode.window.onDidCloseTerminal((t) => {
                if (t === terminal) {
                  clearTimeout(timeoutId);
                  closeSub.dispose();
                }
              });
              if (outputChannel) {
                outputChannel.appendLine(`[触发唤醒] 已向「OpenSkills Wake」终端发送唤醒指令（超时 ${timeoutMinutes} 分钟回收）`);
              }
              vscode.window.showInformationMessage(
                '已向 Cursor Agent 发送唤醒指令。若终端出现「Signing in」，请点击终端中的链接完成 CLI 登录（仅需一次）。',
                '查看终端',
                '打开登录说明'
              ).then(action => {
                if (action === '查看终端') {
                  terminal.show();
                } else if (action === '打开登录说明') {
                  vscode.commands.executeCommand('openskills.openCliLoginPage');
                }
              });
            }
          } catch (terminalError) {
            const errorMsg = terminalError instanceof Error ? terminalError.message : String(terminalError);
            if (outputChannel) {
              outputChannel.appendLine(`[触发唤醒] 发送唤醒指令失败: ${errorMsg}`);
              outputChannel.show();
            }
            vscode.window.showErrorMessage(
              `向 Cursor Agent 发送唤醒指令失败: ${errorMsg}。请查看输出面板获取详情，或手动在终端执行命令。`,
              '查看输出',
              '手动执行'
            ).then(action => {
              if (action === '查看输出' && outputChannel) {
                outputChannel.show();
              } else if (action === '手动执行') {
                vscode.window.showInformationMessage(
                  `请在「OpenSkills Wake」终端或新终端中执行: agent chat "${prompt}"`,
                  '知道了'
                );
              }
            });
          }
        }
      );
    } catch (e) {
      // 整体错误处理
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (outputChannel) {
        outputChannel.appendLine(`[触发唤醒] 执行失败: ${errorMsg}`);
        outputChannel.show();
      }
      vscode.window.showErrorMessage(`触发唤醒失败: ${errorMsg}`);
    }
  });
}
