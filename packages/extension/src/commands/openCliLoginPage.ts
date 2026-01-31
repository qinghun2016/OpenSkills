/**
 * 打开 Cursor CLI 登录页命令
 * Cursor CLI 与编辑器使用独立登录，此命令打开官方说明/登录入口，便于用户完成 CLI 一次性登录
 */

import * as vscode from 'vscode';

/** Cursor CLI 认证说明页（含登录流程说明） */
const CURSOR_CLI_AUTH_URL = 'https://docs.cursor.com/cli/reference/authentication';

/**
 * 注册「打开 Cursor CLI 登录页」命令
 */
export function registerOpenCliLoginPageCommand(_context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.openCliLoginPage', () => {
    vscode.env.openExternal(vscode.Uri.parse(CURSOR_CLI_AUTH_URL));
    vscode.window.showInformationMessage(
      '已打开 Cursor CLI 登录说明。若终端已显示「Signing in」和链接，请优先点击终端中的链接完成登录（仅需一次）。',
      '知道了'
    );
  });
}
