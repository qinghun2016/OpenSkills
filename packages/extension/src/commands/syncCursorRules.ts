/**
 * 同步 Cursor 用户规则命令
 */

import * as vscode from 'vscode';
import { promptAndSyncCursorRules, readCursorUserRules, syncCursorUserRules } from '../utils/cursorRules';

/**
 * 注册同步 Cursor 用户规则命令
 */
export function registerSyncCursorRulesCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.syncCursorRules', async () => {
    await promptAndSyncCursorRules();
  });
}

/**
 * 自动同步 Cursor 用户规则（在初始化时调用）
 * 注意：由于 Cursor 的全局用户规则存储在内部数据库中，无法直接读取
 * 真正的同步会在 skills-admin 巡查时自动执行（从 Agent 上下文中提取）
 */
export async function autoSyncCursorRules(): Promise<void> {
  try {
    // 尝试读取已配置的规则（从扩展配置中）
    const rules = await readCursorUserRules();
    
    if (rules.length > 0) {
      // 如果有配置的规则，自动同步
      const result = await syncCursorUserRules(rules);
      if (result.success) {
        console.log(`[AutoSync] 自动同步了 ${result.exported || 0} 条 Cursor 用户规则`);
      }
    } else {
      // 如果没有配置的规则，不需要手动操作
      // skills-admin 会在巡查时自动从 Agent 上下文中提取并同步规则
      console.log('[AutoSync] 未找到配置的 Cursor 用户规则，将在 skills-admin 巡查时自动同步');
    }
  } catch (error) {
    // 静默失败，不影响扩展启动
    console.error('[AutoSync] 自动同步 Cursor 用户规则失败:', error);
  }
}
