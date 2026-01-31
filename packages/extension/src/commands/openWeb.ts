/**
 * 打开 Web UI 命令
 */

import * as vscode from 'vscode';
import { getActualWebPort } from '../servers/embeddedServers';

/**
 * 获取当前 Web 访问地址（内嵌服务实际端口优先）
 */
export function getWebUrl(): string {
  const actual = getActualWebPort();
  if (actual != null) return `http://localhost:${actual}`;
  const config = vscode.workspace.getConfiguration('openskills');
  const webPort = config.get<number>('webPort') ?? 3848;
  return `http://localhost:${webPort}`;
}

/**
 * 打开指定 URL 到外部浏览器，带错误提示
 */
async function openUrlInBrowser(webUrl: string): Promise<boolean> {
  try {
    const ok = await vscode.env.openExternal(vscode.Uri.parse(webUrl));
    if (ok) {
      vscode.window.setStatusBarMessage(`$(globe) 已在浏览器中打开 ${webUrl}`, 3000);
    } else {
      vscode.window.showWarningMessage(`打开浏览器失败: ${webUrl}。请手动复制地址到浏览器。`);
    }
    return ok;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    vscode.window.showErrorMessage(`在浏览器中打开失败: ${msg}。请手动复制地址: ${webUrl}`);
    return false;
  }
}

/**
 * 注册打开 Web UI 命令
 */
export function registerOpenWebCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.openWeb', async () => {
    const webUrl = getWebUrl();
    
    const answer = await vscode.window.showInformationMessage(
      `打开 OpenSkills Web UI: ${webUrl}`,
      '在浏览器中打开',
      '在编辑器中打开',
      '取消'
    );

    if (answer === '在浏览器中打开') {
      await openUrlInBrowser(webUrl);
    } else if (answer === '在编辑器中打开') {
      // 使用 Simple Browser 扩展（如果可用）
      try {
        await vscode.commands.executeCommand('simpleBrowser.show', webUrl);
      } catch {
        // 降级到外部浏览器
        await openUrlInBrowser(webUrl);
      }
    }
  });
}

/**
 * 供 panel 等调用：直接在浏览器中打开 Web UI（无弹窗选择）
 */
export async function openWebUrlInBrowser(): Promise<boolean> {
  return openUrlInBrowser(getWebUrl());
}

/**
 * 注册「在浏览器中打开」命令（侧边栏等用，无弹窗）
 */
export function registerOpenWebInBrowserCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.openWebInBrowser', () => {
    return openWebUrlInBrowser();
  });
}
