/**
 * OpenSkills VSCode/Cursor Extension
 * AI Skills 自进化管理工具
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cron from 'node-cron';
import { HomeProvider } from './providers/homeProvider';
import { StatusBarProvider } from './providers/statusBarProvider';
import { getApiClient, disposeApiClient } from './api/client';
import { registerInitCommand } from './commands/init';
import { registerApproveCommand } from './commands/approve';
import { registerRejectCommand } from './commands/reject';
import { registerTriggerWakeCommand, startSkillsAdminAgent } from './commands/triggerWake';
import { registerOpenWebCommand } from './commands/openWeb';
import { registerOpenPanelCommand, OpenSkillsPanel } from './webview/panel';
import { registerHealthCheckCommand } from './commands/healthCheck';
import { registerDiagnoseCommand } from './commands/diagnose';
import { registerOpenDiagnosePanelCommand, DiagnosePanel } from './webview/diagnosePanel';
import { registerAutoFixCommand } from './commands/autoFix';
import { registerSyncCursorRulesCommand, autoSyncCursorRules } from './commands/syncCursorRules';
import { registerOpenCliLoginPageCommand } from './commands/openCliLoginPage';
import { killBackgroundAgentProcess, killBackgroundAgentProcessAsync } from './utils/agentCli';
import {
  isOpenSkillsInitialized,
  skillsAdminExists,
  getSkillsAdminPath,
  getWorkspaceRoot,
  getFirstWorkspaceFolder,
  getUserSkillsDir
} from './utils/paths';
import {
  initializeOpenSkillsStructure,
  createSkillsAdminSkill,
  createSkillsAdminAgent
} from './commands/init';
import { startEmbeddedServersIfEnabled, stopEmbeddedServers, killOrphanProcessesInExtensionPath } from './servers/embeddedServers';
import { getOutputChannel } from './outputChannel';

// 全局 providers
let homeProvider: HomeProvider;
let statusBarProvider: StatusBarProvider;
let refreshInterval: NodeJS.Timeout | undefined;
let wakeCheckTask: cron.ScheduledTask | null = null;
let outputChannel: vscode.OutputChannel;
let lastWakeCheckTime: number = 0;

/** Set when setupAutoWake's immediate check triggers wake; skip autoStart to avoid double wake */
let wakeTriggeredByImmediateCheck: boolean = false;

/** 本次窗口/扩展激活时间（用于判断 skills-admin 是否已被 Cursor 在本会话加载） */
let lastActivationTimeMs: number = 0;

/**
 * skills-admin 初始化结果（插件启动时创建定义 + 可选自动启动 Agent）
 * 供诊断面板显示「未就绪」原因，避免仅显示定义存在而误判为正常。
 */
export interface SkillsAdminInitResult {
  /** 定义文件是否就绪（.cursor/skills/skills-admin、.cursor/agents 等） */
  filesOk: boolean;
  /** 是否尝试过自动启动 Agent */
  autoStartAttempted?: boolean;
  /** 自动启动是否成功 */
  autoStartOk?: boolean;
  /** 初始化（创建定义）失败原因 */
  initErrorMessage?: string;
  /** 自动启动 Agent 失败原因 */
  autoStartErrorMessage?: string;
}

let lastSkillsAdminInitResult: SkillsAdminInitResult | null = null;

/**
 * 获取最近一次 skills-admin 初始化结果（供诊断面板等使用）
 */
export function getLastSkillsAdminInitResult(): SkillsAdminInitResult | null {
  return lastSkillsAdminInitResult;
}

/**
 * 获取本次窗口激活时间（供健康检查等判断「是否已重载」）
 */
export function getLastActivationTimeMs(): number {
  return lastActivationTimeMs;
}

export { getOutputChannel } from './outputChannel';

/**
 * 扩展激活入口
 */
export async function activate(context: vscode.ExtensionContext) {
  lastActivationTimeMs = Date.now();
  outputChannel = getOutputChannel();
  outputChannel.appendLine('OpenSkills 扩展正在激活...');

  try {
    // 初始化 Providers
    homeProvider = new HomeProvider();
    statusBarProvider = new StatusBarProvider();

    // 注册 TreeView（单一入口：打开 Web 主页面）
    const homeTreeView = vscode.window.createTreeView('openskills.home', {
      treeDataProvider: homeProvider
    });
    context.subscriptions.push(homeTreeView);

    // 注册命令
    context.subscriptions.push(
      registerInitCommand(context),
      registerApproveCommand(context),
      registerRejectCommand(context),
      registerTriggerWakeCommand(context),
      registerOpenWebCommand(context),
      registerOpenPanelCommand(context),
      registerRefreshCommand(),
      registerHealthCheckCommand(context),
      registerDiagnoseCommand(context),
      registerOpenDiagnosePanelCommand(context),
      registerAutoFixCommand(context),
      registerSyncCursorRulesCommand(context),
      registerOpenCliLoginPageCommand(context)
    );

    // 尽早初始化 skills-admin（约 300ms 后），以便 Cursor 在扫描 .cursor/skills 时能看到
    Promise.resolve().then(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        if (isOpenSkillsInitialized()) {
          await loadSkillsAdmin(context);
          lastSkillsAdminInitResult = { filesOk: skillsAdminExists() };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastSkillsAdminInitResult = { filesOk: false, initErrorMessage: msg };
        if (outputChannel) {
          outputChannel.appendLine(`[Skills Admin 初始化] ⚠️ ${msg}`);
        }
        vscode.window.showWarningMessage(
          `OpenSkills: skills-admin 初始化失败。${msg}`,
          '查看输出',
          '运行初始化'
        ).then(choice => {
          if (choice === '查看输出' && outputChannel) outputChannel.show();
          else if (choice === '运行初始化') vscode.commands.executeCommand('openskills.init');
        });
      }
    }).catch(() => {});

    // 后台执行：先启动内嵌 API/Web（若启用），再检查 API 与初始化
    Promise.resolve().then(async () => {
      try {
        startEmbeddedServersIfEnabled(context, outputChannel);
        await new Promise(resolve => setTimeout(resolve, 2500));
        await checkApiAndUpdate();

        // 自动初始化检查
        await autoInitializeOpenSkills(context);

        // 再次检查/创建 skills-admin（插件启动时即初始化，失败则提示用户）
        try {
          await loadSkillsAdmin(context);
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          lastSkillsAdminInitResult = { ...(lastSkillsAdminInitResult || {}), filesOk: false, initErrorMessage: msg };
          if (outputChannel) outputChannel.appendLine(`[Skills Admin 初始化] ⚠️ ${msg}`);
          vscode.window.showWarningMessage(
            `OpenSkills: skills-admin 初始化失败。${msg}`,
            '查看输出',
            '运行初始化'
          ).then(choice => {
            if (choice === '查看输出' && outputChannel) outputChannel.show();
            else if (choice === '运行初始化') vscode.commands.executeCommand('openskills.init');
          });
        }
        lastSkillsAdminInitResult = { ...(lastSkillsAdminInitResult || {}), filesOk: skillsAdminExists() };

        // 自动启动 skills-admin Agent（在终端真正启动进程，非仅定义）
        // Skip if setupAutoWake's immediate check already triggered (avoid double wake)
        const cfg = vscode.workspace.getConfiguration('openskills');
        const autoStart = cfg.get<boolean>('autoStartSkillsAdminOnActivation', true);
        if (wakeTriggeredByImmediateCheck && outputChannel) {
          outputChannel.appendLine('[AutoStart] 已由 setupAutoWake 立即检查触发，跳过自动启动以避免重复唤醒');
        }
        if (autoStart && !wakeTriggeredByImmediateCheck && isOpenSkillsInitialized()) {
          const workspaceRoot = getWorkspaceRoot() || getFirstWorkspaceFolder();
          if (workspaceRoot) {
            const result = await startSkillsAdminAgent(workspaceRoot);
            lastSkillsAdminInitResult = {
              ...(lastSkillsAdminInitResult || { filesOk: skillsAdminExists() }),
              autoStartAttempted: true,
              autoStartOk: result.started,
              autoStartErrorMessage: result.started ? undefined : (result.errorMessage || '未知原因')
            };
            if (outputChannel) {
              if (result.started) {
                outputChannel.appendLine('[AutoStart] ✅ 已在终端启动 skills-admin Agent（OpenSkills Wake）');
              } else {
                outputChannel.appendLine(`[AutoStart] ⚠️ 未自动启动 Agent：${result.errorMessage || '未知原因'}`);
              }
            }
            if (!result.started) {
              vscode.window.showWarningMessage(
                `OpenSkills: 未自动启动 skills-admin Agent。${result.errorMessage || '未知原因'}`,
                '查看输出',
                '打开诊断'
              ).then(choice => {
                if (choice === '查看输出' && outputChannel) outputChannel.show();
                else if (choice === '打开诊断') vscode.commands.executeCommand('openskills.openDiagnosePanel');
              });
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastSkillsAdminInitResult = { ...(lastSkillsAdminInitResult || {}), filesOk: false, initErrorMessage: msg };
        if (outputChannel) {
          outputChannel.appendLine(`[后台任务] 执行失败: ${msg}`);
        }
        vscode.window.showWarningMessage(
          `OpenSkills: 后台初始化异常。${msg}`,
          '查看输出'
        ).then(choice => { if (choice === '查看输出' && outputChannel) outputChannel.show(); });
      }
    }).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      if (outputChannel) {
        outputChannel.appendLine(`[后台任务] 捕获异常: ${msg}`);
      }
    });

    // 自动同步 Cursor 用户规则（非阻塞，避免卡死扩展启动）
    Promise.resolve().then(() => autoSyncCursorRules()).catch(err => {
      if (outputChannel) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`[AutoSync] ⚠️ 后台同步失败: ${errorMsg}`);
      }
    });

    // 设置自动刷新
    setupAutoRefresh();

    // 设置自动唤醒检查
    setupAutoWake();

    // 监听配置变化
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('openskills')) {
          getApiClient().updateBaseUrl();
          setupAutoRefresh();
          setupAutoWake();
        }
      })
    );

    // 监听文件变化
    const watcher = vscode.workspace.createFileSystemWatcher('**/.openskills/**/*.json');
    watcher.onDidChange(() => {
      refreshAll().catch(err => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        if (outputChannel) {
          outputChannel.appendLine(`[文件监听] 刷新失败: ${errorMsg}`);
          if (errorStack) {
            outputChannel.appendLine(`[文件监听] 堆栈跟踪: ${errorStack}`);
          }
        }
      });
    });
    watcher.onDidCreate(() => {
      refreshAll().catch(err => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        if (outputChannel) {
          outputChannel.appendLine(`[文件监听] 刷新失败: ${errorMsg}`);
          if (errorStack) {
            outputChannel.appendLine(`[文件监听] 堆栈跟踪: ${errorStack}`);
          }
        }
      });
    });
    watcher.onDidDelete(() => {
      refreshAll().catch(err => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        if (outputChannel) {
          outputChannel.appendLine(`[文件监听] 刷新失败: ${errorMsg}`);
          if (errorStack) {
            outputChannel.appendLine(`[文件监听] 堆栈跟踪: ${errorStack}`);
          }
        }
      });
    });
    context.subscriptions.push(watcher);

    // 监听 skills-admin 文件变化（用于状态栏更新）
    const skillsAdminWatcher = vscode.workspace.createFileSystemWatcher('**/.cursor/skills/skills-admin/SKILL.md');
    skillsAdminWatcher.onDidChange(() => {
      if (statusBarProvider) {
        statusBarProvider.refresh().catch(err => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          if (outputChannel) {
            outputChannel.appendLine(`[Skills Admin 监听] 刷新失败: ${errorMsg}`);
            if (errorStack) {
              outputChannel.appendLine(`[Skills Admin 监听] 堆栈跟踪: ${errorStack}`);
            }
          }
        });
      }
    });
    skillsAdminWatcher.onDidCreate(() => {
      if (statusBarProvider) {
        statusBarProvider.refresh().catch(err => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          if (outputChannel) {
            outputChannel.appendLine(`[Skills Admin 监听] 刷新失败: ${errorMsg}`);
            if (errorStack) {
              outputChannel.appendLine(`[Skills Admin 监听] 堆栈跟踪: ${errorStack}`);
            }
          }
        });
      }
    });
    skillsAdminWatcher.onDidDelete(() => {
      if (statusBarProvider) {
        statusBarProvider.refresh().catch(err => {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          if (outputChannel) {
            outputChannel.appendLine(`[Skills Admin 监听] 刷新失败: ${errorMsg}`);
            if (errorStack) {
              outputChannel.appendLine(`[Skills Admin 监听] 堆栈跟踪: ${errorStack}`);
            }
          }
        });
      }
    });
    context.subscriptions.push(skillsAdminWatcher);

    // 注册 StatusBar
    context.subscriptions.push({ dispose: () => statusBarProvider.dispose() });

    outputChannel.appendLine('OpenSkills 扩展已激活。侧边栏请点击「OpenSkills」图标，状态栏在窗口左下角。');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`[错误] 激活失败: ${msg}`);
    if (err instanceof Error && err.stack) {
      outputChannel.appendLine(err.stack);
    }
    vscode.window.showErrorMessage(
      `OpenSkills 扩展激活失败: ${msg}。请查看「输出」→ OpenSkills 获取详情。`
    );
    throw err;
  }
}

/**
 * 扩展停用：先关闭 Webview 与定时器，再并行结束所有子进程并等待退出。
 * Webview 的 localResourceRoots 会占用扩展目录，必须先关闭；进程结束并行执行以免超时。
 */
export async function deactivate(): Promise<void> {
  // 1. 立即关闭 Webview 面板，释放 localResourceRoots 对扩展目录的占用
  try {
    OpenSkillsPanel.currentPanel?.dispose();
  } catch {
    // ignore
  }
  try {
    DiagnosePanel.currentPanel?.dispose();
  } catch {
    // ignore
  }

  // 2. 停止定时器与 cron，避免停用期间仍有回调访问资源
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = undefined;
  }
  if (wakeCheckTask) {
    try {
      wakeCheckTask.stop();
    } catch {
      // ignore
    }
    wakeCheckTask = null;
  }
  disposeApiClient();

  // 3. 隐藏并释放状态栏
  try {
    statusBarProvider?.hide();
  } catch {
    // ignore
  }
  try {
    statusBarProvider?.dispose();
  } catch {
    // ignore
  }

  // 4. 并行结束 Agent 与 API/Web 进程并等待退出，缩短总等待时间避免 deactivate 超时
  try {
    await Promise.all([killBackgroundAgentProcessAsync(), stopEmbeddedServers()]);
  } catch {
    // ignore
  }

  // 5. 兜底：若此前 Web 用 shell:true 启动，kill 的可能是 shell 而非 node，补杀命令行含 openskills.openskills 的 node
  try {
    killOrphanProcessesInExtensionPath();
  } catch {
    // ignore
  }
}

/**
 * 检查 API 状态并更新 UI（内部 catch，不向外抛错）
 */
async function checkApiAndUpdate(): Promise<void> {
  try {
    const client = getApiClient();
    client.updateBaseUrl(); // 每次检查前刷新 API 地址（内嵌服务端口可能已变更）
    const available = await client.checkHealth();

    statusBarProvider.setApiAvailable(available);

    if (!available) {
      vscode.window.setStatusBarMessage('$(warning) OpenSkills API 未连接', 5000);
      if (outputChannel) {
        outputChannel.appendLine('[API 检查] ⚠️ API 未连接');
        outputChannel.appendLine('[API 检查] 解决方案：');
        outputChannel.appendLine('  1. 确保 API 服务正在运行');
        outputChannel.appendLine('  2. 运行: npm run dev（或启用插件的「自动启动服务」）');
        outputChannel.appendLine('  3. 检查配置中的 API URL 是否正确');
        outputChannel.appendLine('  4. 扩展将使用离线模式（文件系统）继续工作');
      }
    } else {
      if (outputChannel) {
        outputChannel.appendLine('[API 检查] ✅ API 连接正常');
      }
    }

    await refreshAll();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    if (outputChannel) {
      outputChannel.appendLine(`[API 检查] ❌ 检查失败: ${msg}`);
      if (stack) {
        outputChannel.appendLine(`[API 检查] 堆栈跟踪:`);
        outputChannel.appendLine(stack);
      }
      outputChannel.appendLine('[API 检查] 扩展将使用离线模式继续工作');
    }
    statusBarProvider.setApiAvailable(false);
    await refreshAll().catch(refreshErr => {
      if (outputChannel) {
        const refreshMsg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        outputChannel.appendLine(`[API 检查] 刷新失败: ${refreshMsg}`);
      }
    });
  }
}

/**
 * 加载 skills-admin（若缺失则自动创建，确保 Cursor 在当前窗口能显示 agent）。
 * 以「当前打开的」第一个工作区文件夹为准，因为 Cursor 只扫描该路径下的 .cursor/skills/。
 */
async function loadSkillsAdmin(context: vscode.ExtensionContext): Promise<void> {
  try {
    const cursorRoot = getFirstWorkspaceFolder();
    if (!cursorRoot) {
      return;
    }

    const projectSkillsAdminPath = path.join(cursorRoot, '.cursor', 'skills', 'skills-admin', 'SKILL.md');
    if (fs.existsSync(projectSkillsAdminPath)) {
      if (outputChannel) {
        outputChannel.appendLine(`[Skills Admin] ✅ 已找到（Cursor 可见）: ${projectSkillsAdminPath}`);
      }
      context.workspaceState.update('skillsAdminPath', projectSkillsAdminPath);
      return;
    }

    const userSkillsAdminPath = path.join(getUserSkillsDir(), 'skills-admin', 'SKILL.md');
    if (fs.existsSync(userSkillsAdminPath) && outputChannel) {
      outputChannel.appendLine(`[Skills Admin] ⚠️ 当前窗口下未找到 skills-admin，但用户级存在。正在在当前工作区创建...`);
    } else if (outputChannel) {
      outputChannel.appendLine(`[Skills Admin] 当前工作区未找到 skills-admin，正在自动创建...`);
    }

    if (isOpenSkillsInitialized()) {
      await ensureSkillsAdmin(context);
    } else if (outputChannel) {
      outputChannel.appendLine(`[Skills Admin] 项目尚未初始化 .openskills，请先运行「OpenSkills: 初始化」或等待自动初始化后再创建 skills-admin`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    if (outputChannel) {
      outputChannel.appendLine(`[Skills Admin] ⚠️ 加载检查失败: ${msg}`);
      if (stack) {
        outputChannel.appendLine(`[Skills Admin] 堆栈跟踪:`);
        outputChannel.appendLine(stack);
      }
      outputChannel.appendLine('[Skills Admin] 不影响扩展激活，将在需要时自动创建');
    }
    // 忽略，不影响激活
  }
}

/**
 * 自动初始化 OpenSkills（完整初始化）
 */
async function autoInitializeOpenSkills(context: vscode.ExtensionContext): Promise<void> {
  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      if (outputChannel) {
        outputChannel.appendLine('[AutoInit] ⚠️ 未检测到工作区，跳过自动初始化');
        outputChannel.appendLine('[AutoInit] 提示：请先打开包含 .openskills 的项目文件夹');
      }
      return;
    }

    if (!isOpenSkillsInitialized()) {
      // 完整初始化
      if (outputChannel) {
        outputChannel.appendLine('[AutoInit] 🔄 检测到未初始化，开始自动初始化...');
        outputChannel.appendLine(`[AutoInit] 工作区路径: ${workspaceRoot}`);
      }
      await initializeOpenSkillsStructure(workspaceRoot, outputChannel, context.extensionPath);
      if (outputChannel) {
        outputChannel.appendLine('[AutoInit] ✅ 自动初始化完成');
      }
    } else {
      // 已初始化：在「当前打开的」工作区文件夹下检查 skills-admin（Cursor 只扫描该路径）
      const cursorRoot = getFirstWorkspaceFolder();
      const projectSkillsAdminPath = cursorRoot
        ? path.join(cursorRoot, '.cursor', 'skills', 'skills-admin', 'SKILL.md')
        : '';
      if (!cursorRoot || !fs.existsSync(projectSkillsAdminPath)) {
        if (outputChannel) {
          outputChannel.appendLine('[AutoInit] 🔄 检测到当前窗口下 skills-admin 缺失，开始创建...');
        }
        await ensureSkillsAdmin(context);
      } else if (outputChannel) {
        outputChannel.appendLine(`[AutoInit] ✅ 当前窗口下 skills-admin 已存在: ${projectSkillsAdminPath}`);
      }
    }
  } catch (error) {
    // 错误处理：不阻止扩展激活，但记录详细错误
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    if (outputChannel) {
      outputChannel.appendLine(`[AutoInit] ❌ 自动初始化失败: ${message}`);
      if (stack) {
        outputChannel.appendLine(`[AutoInit] 堆栈跟踪:`);
        outputChannel.appendLine(stack);
      }
      outputChannel.appendLine('[AutoInit] 建议：');
      outputChannel.appendLine('  1. 检查工作区路径是否正确');
      outputChannel.appendLine('  2. 检查文件系统权限');
      outputChannel.appendLine('  3. 运行 "OpenSkills: 初始化" 命令手动初始化');
      outputChannel.appendLine('  4. 查看输出面板获取更多详情');
    }
    // 静默失败，不显示错误提示，避免打断用户工作流
  }
}

/**
 * 确保 skills-admin 存在（只创建缺失的 skills-admin）。
 * 在「当前打开的」第一个工作区文件夹下创建，这样 Cursor 扫描 .cursor/skills/ 时才能看到 Agent。
 */
async function ensureSkillsAdmin(context: vscode.ExtensionContext): Promise<void> {
  try {
    const cursorRoot = getFirstWorkspaceFolder();
    if (!cursorRoot) {
      if (outputChannel) {
        outputChannel.appendLine('[EnsureSkillsAdmin] ⚠️ 未检测到工作区文件夹，跳过创建 skills-admin');
      }
      return;
    }

    const openSkillsRoot = getWorkspaceRoot();
    if (!openSkillsRoot || !isOpenSkillsInitialized()) {
      if (outputChannel) {
        outputChannel.appendLine('[EnsureSkillsAdmin] ⚠️ 项目尚未初始化 .openskills，请先运行「OpenSkills: 初始化」');
      }
      return;
    }

    const projectSkillsAdminPath = path.join(cursorRoot, '.cursor', 'skills', 'skills-admin', 'SKILL.md');
    if (outputChannel) {
      outputChannel.appendLine(`[EnsureSkillsAdmin] 创建路径（Cursor 可见）: ${projectSkillsAdminPath}`);
      if (cursorRoot !== openSkillsRoot) {
        outputChannel.appendLine(`[EnsureSkillsAdmin] 说明: 当前打开的是子文件夹，skills-admin 将创建在此处以便 Cursor 显示 Agent`);
      }
    }

    let result = await createSkillsAdminSkill(cursorRoot, outputChannel);

    // 若当前打开的是子文件夹（如 packages/extension），也在 OpenSkills 根目录创建，以便 Cursor 从任一根扫描时都能看到
    if (cursorRoot !== openSkillsRoot) {
      const rootResult = await createSkillsAdminSkill(openSkillsRoot, outputChannel);
      if (rootResult.created && outputChannel) {
        outputChannel.appendLine(`[EnsureSkillsAdmin] ✅ 已在 OpenSkills 根目录创建 Skill: ${rootResult.filePath}`);
      }
      if (!result.created && rootResult.filePath) {
        result = { ...result, filePath: result.filePath || rootResult.filePath };
      }
    }

    // Cursor 的 Agent 列表来自 .cursor/agents/ 下的定义文件；实际启动 Agent 进程由 Cursor 在用户选用时完成。此处只创建定义文件。
    const agentResult = createSkillsAdminAgent(cursorRoot, outputChannel);
    if (cursorRoot !== openSkillsRoot) {
      createSkillsAdminAgent(openSkillsRoot, outputChannel);
    }

    if (result.created) {
      // 新创建了文件
      const method = result.usedAgentCli ? 'Agent CLI' : '直接创建';
      if (outputChannel) {
        outputChannel.appendLine(`[EnsureSkillsAdmin] ✅ 已创建项目级 skills-admin (${method})`);
        outputChannel.appendLine(`[EnsureSkillsAdmin] 文件路径: ${result.filePath}`);
        
        if (result.verified) {
          outputChannel.appendLine(`[EnsureSkillsAdmin] ✅ 文件验证通过：内容完整且可读`);
        } else {
          outputChannel.appendLine(`[EnsureSkillsAdmin] ⚠️ 文件验证失败：${result.error || '未知错误'}`);
        }
      }

      // 在输出面板提示需要重新加载窗口（不阻塞，避免卡死扩展）
      if (result.verified) {
        if (outputChannel) {
          outputChannel.appendLine('[EnsureSkillsAdmin] ⚠️ 重要提示：文件已创建，但 Cursor 尚未加载 Agent');
          outputChannel.appendLine('[EnsureSkillsAdmin] 💡 必须重新加载窗口（Ctrl+Shift+P → Developer: Reload Window）才能使 skills-admin Agent 可用');
        }
      } else {
        if (outputChannel) {
          outputChannel.appendLine(`[EnsureSkillsAdmin] ⚠️ 文件验证失败：${result.error || '未知错误'}`);
        }
      }
      
      // 刷新 providers
      Promise.resolve(vscode.commands.executeCommand('openskills.refresh')).catch(() => {});
    } else {
      // 文件已存在
      if (outputChannel) {
        outputChannel.appendLine(`[EnsureSkillsAdmin] ✅ 项目级 skills-admin 已存在: ${result.filePath}`);
        
        if (result.verified) {
          outputChannel.appendLine(`[EnsureSkillsAdmin] ✅ 文件验证通过：内容完整且可读`);
        } else {
          outputChannel.appendLine(`[EnsureSkillsAdmin] ⚠️ 文件验证失败：文件可能损坏或不可读`);
          outputChannel.appendLine(`[EnsureSkillsAdmin] 建议：运行 "OpenSkills: 健康检查" 命令检查并修复`);
        }
      }
    }
  } catch (error) {
    // 错误处理：不阻止扩展激活，但记录详细错误
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    lastSkillsAdminInitResult = { filesOk: false, initErrorMessage: message };

    if (outputChannel) {
      outputChannel.appendLine(`[EnsureSkillsAdmin] ❌ 创建失败: ${message}`);
      if (stack) {
        outputChannel.appendLine(`[EnsureSkillsAdmin] 堆栈跟踪:`);
        outputChannel.appendLine(stack);
      }
      outputChannel.appendLine(`[EnsureSkillsAdmin] 建议：运行 "OpenSkills: 初始化" 命令手动创建 skills-admin`);
    }
    
    // 显示错误通知（非阻塞）
    vscode.window.showErrorMessage(
      `OpenSkills: 创建 skills-admin 失败。请查看输出面板获取详情，或运行 "OpenSkills: 初始化" 命令。`,
      '查看输出',
      '运行初始化'
    ).then(action => {
      if (action === '查看输出' && outputChannel) {
        outputChannel.show();
      } else if (action === '运行初始化') {
        vscode.commands.executeCommand('openskills.init');
      }
    });
  }
}

/**
 * 设置自动刷新
 */
function setupAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  const config = vscode.workspace.getConfiguration('openskills');
  const autoRefresh = config.get<boolean>('autoRefresh', true);
  const interval = config.get<number>('refreshInterval', 30) * 1000;

  if (autoRefresh && interval > 0) {
    if (outputChannel) {
      outputChannel.appendLine(`[自动刷新] ✅ 已启用，间隔: ${interval / 1000} 秒`);
    }
    refreshInterval = setInterval(() => {
      refreshAll().catch(err => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        if (outputChannel) {
          outputChannel.appendLine(`[自动刷新] ⚠️ 刷新失败: ${errorMsg}`);
          if (errorStack) {
            outputChannel.appendLine(`[自动刷新] 堆栈跟踪: ${errorStack}`);
          }
        }
      });
    }, interval);
  } else {
    if (outputChannel) {
      outputChannel.appendLine('[自动刷新] ℹ️ 已禁用或间隔为 0');
    }
  }
}

/**
 * 设置自动唤醒检查
 * 使用 cron 表达式定期检查 .openskills/wake/pending.json 文件，如果存在且配置启用，则触发唤醒
 */
function setupAutoWake(): void {
  // 停止现有的任务
  if (wakeCheckTask) {
    wakeCheckTask.stop();
    wakeCheckTask = null;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const configPath = path.join(workspaceRoot, '.openskills', 'config.json');
  if (!fs.existsSync(configPath)) {
    return;
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent) as { wake?: { enabled?: boolean; schedule?: string } };
    
    if (!config.wake?.enabled) {
      if (outputChannel) {
        outputChannel.appendLine('[AutoWake] 自动唤醒已禁用');
      }
      return;
    }

    // 获取 cron 表达式，如果未配置或无效，使用默认值（每4小时）
    const schedule = config.wake.schedule || '0 */4 * * *';
    const defaultSchedule = '0 */4 * * *';
    
    // 验证 cron 表达式
    let validSchedule = schedule;
    if (!cron.validate(schedule)) {
      if (outputChannel) {
        outputChannel.appendLine(`[AutoWake] 无效的 cron 表达式: ${schedule}，使用默认值: ${defaultSchedule}`);
      }
      validSchedule = defaultSchedule;
    }

    // 使用系统时区（与 API 端一致）
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cronOptions: cron.ScheduleOptions = {
      timezone: process.env.TZ || systemTimezone || 'UTC',
    };

    // 创建 cron 任务
    wakeCheckTask = cron.schedule(validSchedule, () => {
      checkAndTriggerWake(workspaceRoot).catch(err => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        if (outputChannel) {
          outputChannel.appendLine(`[AutoWake] ❌ 检查失败: ${errorMsg}`);
          if (errorStack) {
            outputChannel.appendLine(`[AutoWake] 堆栈跟踪:`);
            outputChannel.appendLine(errorStack);
          }
          outputChannel.appendLine('[AutoWake] 提示：可以手动运行 "OpenSkills: 触发唤醒" 命令');
        }
      });
    }, cronOptions);

    if (outputChannel) {
      outputChannel.appendLine(`[AutoWake] ✅ 已启用自动唤醒检查`);
      outputChannel.appendLine(`[AutoWake] Cron 表达式: ${validSchedule}`);
      outputChannel.appendLine(`[AutoWake] 时区: ${cronOptions.timezone}`);
    }

    // 立即检查一次
    checkAndTriggerWake(workspaceRoot).catch(err => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (outputChannel) {
        outputChannel.appendLine(`[AutoWake] ⚠️ 初始检查失败: ${errorMsg}`);
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    if (outputChannel) {
      outputChannel.appendLine(`[AutoWake] ❌ 设置失败: ${msg}`);
      if (stack) {
        outputChannel.appendLine(`[AutoWake] 堆栈跟踪:`);
        outputChannel.appendLine(stack);
      }
      outputChannel.appendLine('[AutoWake] 建议：');
      outputChannel.appendLine('  1. 检查 .openskills/config.json 中的 wake 配置');
      outputChannel.appendLine('  2. 检查 cron 表达式格式是否正确');
      outputChannel.appendLine('  3. 可以手动运行 "OpenSkills: 触发唤醒" 命令');
    }
  }
}

/**
 * 检查并触发唤醒
 */
async function checkAndTriggerWake(workspaceRoot: string): Promise<void> {
  const wakePendingPath = path.join(workspaceRoot, '.openskills', 'wake', 'pending.json');
  
  if (!fs.existsSync(wakePendingPath)) {
    return; // 没有待触发的唤醒
  }

  try {
    const pendingContent = fs.readFileSync(wakePendingPath, 'utf-8');
    const pending = JSON.parse(pendingContent) as { 
      timestamp?: string; 
      triggered?: boolean; 
      pendingCount?: number;
      processed?: boolean;
      processedAt?: string;
    };
    
    // 优先使用 processed 标记判断是否已处理（更可靠）
    if (pending.processed === true) {
      if (outputChannel) {
        outputChannel.appendLine(`[AutoWake] pending.json 已标记为已处理（processedAt: ${pending.processedAt || '未知'}），跳过`);
      }
      return; // 已经处理过
    }

    // 如果没有 processed 标记，使用时间戳作为降级方案（向后兼容）
    // 但只在扩展重启后第一次检查时使用，避免误判
    if (!pending.processed && pending.timestamp) {
      const pendingTime = new Date(pending.timestamp).getTime();
      // 如果时间戳很旧（超过1小时），可能是遗留文件，仍然处理
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (pendingTime > oneHourAgo && pendingTime <= lastWakeCheckTime) {
        if (outputChannel) {
          outputChannel.appendLine(`[AutoWake] pending.json 时间戳 ${pending.timestamp} 已处理过，跳过`);
        }
        return; // 已经处理过
      }
      // 更新 lastWakeCheckTime 用于下次判断
      if (pendingTime > lastWakeCheckTime) {
        lastWakeCheckTime = pendingTime;
      }
    }

    // 如果有 pending proposals，触发唤醒
    if (pending.pendingCount && pending.pendingCount > 0) {
      if (outputChannel) {
        outputChannel.appendLine(`[AutoWake] 检测到 ${pending.pendingCount} 个 pending proposals，触发唤醒...`);
      }

      wakeTriggeredByImmediateCheck = true;
      await vscode.commands.executeCommand('openskills.triggerWake');

      // 标记为已处理，避免重复触发
      try {
        const updatedPending = { 
          ...pending, 
          processed: true, 
          processedAt: new Date().toISOString() 
        };
        fs.writeFileSync(wakePendingPath, JSON.stringify(updatedPending, null, 2), 'utf-8');
        if (outputChannel) {
          outputChannel.appendLine(`[AutoWake] 已标记 pending.json 为已处理`);
        }
      } catch (writeError) {
        if (outputChannel) {
          const msg = writeError instanceof Error ? writeError.message : String(writeError);
          outputChannel.appendLine(`[AutoWake] 警告：标记 pending.json 为已处理失败: ${msg}`);
        }
      }
    } else {
      // 即使没有 pending proposals，也标记为已处理，避免重复检查
      if (outputChannel) {
        outputChannel.appendLine(`[AutoWake] pending.json 存在但 pendingCount 为 0，标记为已处理`);
      }
      try {
        const updatedPending = { 
          ...pending, 
          processed: true, 
          processedAt: new Date().toISOString() 
        };
        fs.writeFileSync(wakePendingPath, JSON.stringify(updatedPending, null, 2), 'utf-8');
      } catch {
        // 忽略写入错误
      }
    }
  } catch (error) {
    if (outputChannel) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      outputChannel.appendLine(`[AutoWake] 检查 pending.json 失败: ${msg}`);
      if (stack) {
        outputChannel.appendLine(stack);
      }
    }
  }
}

/**
 * 刷新所有数据（内部 catch，不向外抛错）
 */
async function refreshAll(): Promise<void> {
  try {
    if (!statusBarProvider) {
      if (outputChannel) {
        outputChannel.appendLine('[refreshAll] ⚠️ Providers 尚未初始化，跳过刷新');
      }
      return;
    }

    await statusBarProvider.refresh();
    OpenSkillsPanel.refresh();
    DiagnosePanel.refresh();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    if (outputChannel) {
      outputChannel.appendLine(`[refreshAll] ❌ 刷新失败: ${msg}`);
      if (stack) {
        outputChannel.appendLine(`[refreshAll] 堆栈跟踪:`);
        outputChannel.appendLine(stack);
      }
      outputChannel.appendLine('[refreshAll] 建议：');
      outputChannel.appendLine('  1. 检查工作区是否正确打开');
      outputChannel.appendLine('  2. 检查 .openskills 目录是否存在且可访问');
      outputChannel.appendLine('  3. 运行 "OpenSkills: 刷新" 命令手动刷新');
    }
  }
}

/**
 * 注册刷新命令
 */
function registerRefreshCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.refresh', async () => {
    await checkApiAndUpdate();
    vscode.window.setStatusBarMessage('$(check) OpenSkills 已刷新', 2000);
  });
}

