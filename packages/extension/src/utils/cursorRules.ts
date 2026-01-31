/**
 * Cursor Rules 工具
 * 读取和同步 Cursor 全局用户规则
 */

import * as vscode from 'vscode';
import { getApiClient } from '../api/client';
import { getOutputChannel } from '../outputChannel';

export interface CursorUserRule {
  content: string;
  description?: string;
}

/**
 * 读取 Cursor 的全局用户规则
 * 注意：由于 Cursor 的全局用户规则存储在内部数据库中，
 * 无法直接通过文件系统读取。此函数尝试通过以下方式获取：
 * 1. 从扩展配置中读取（如果用户手动配置）
 * 2. 从工作区配置中读取
 * 3. 返回空数组（需要用户手动输入）
 */
export async function readCursorUserRules(): Promise<CursorUserRule[]> {
  const rules: CursorUserRule[] = [];

  // 方法1：从扩展配置读取（如果用户手动配置了）
  const config = vscode.workspace.getConfiguration('openskills');
  const customRules = config.get<string>('cursorUserRules', '');
  
  if (customRules && customRules.trim()) {
    // 假设规则以换行分隔，或者以特定格式存储
    const ruleLines = customRules.split('\n').filter(line => line.trim());
    for (const line of ruleLines) {
      if (line.trim()) {
        rules.push({
          content: line.trim(),
        });
      }
    }
  }

  // 方法2：尝试从 Cursor 的设置中读取（如果 Cursor 提供了 API）
  // 注意：目前 Cursor 没有公开的 API 来读取全局用户规则
  // 这需要 Cursor 提供扩展 API 支持

  // 如果没有任何规则，返回空数组
  // 用户需要手动在 Cursor 设置中查看规则，然后通过命令同步
  return rules;
}

/**
 * 同步 Cursor 全局用户规则到文件系统
 */
export async function syncCursorUserRules(rules: CursorUserRule[]): Promise<{
  success: boolean;
  exported?: number;
  error?: string;
}> {
  try {
    const client = getApiClient();
    
    // 检查 API 是否可用
    const apiAvailable = await client.checkHealth();
    if (!apiAvailable) {
      return {
        success: false,
        error: 'API 服务不可用，请确保 OpenSkills API 服务正在运行',
      };
    }

    // 调用 API 同步规则（使用 ApiClient 的 request 方法）
    const apiUrl = client.getBaseUrl();
    const url = new URL('/api/cursor-rules/sync', apiUrl);
    
    // 使用 Node.js 的 http/https 模块
    const http = await import('http');
    const https = await import('https');
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve) => {
      const postData = JSON.stringify({ rules });
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 10000,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.success) {
              resolve({
                success: true,
                exported: result.data?.exported || 0,
              });
            } else {
              resolve({
                success: false,
                error: result.error || '同步失败',
              });
            }
          } catch (parseError) {
            resolve({
              success: false,
              error: `解析响应失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          error: `请求失败: ${error.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: '请求超时',
        });
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * 提示用户输入 Cursor 全局用户规则并同步
 */
export async function promptAndSyncCursorRules(): Promise<void> {
  const outputChannel = getOutputChannel();
  
  // 提示用户输入规则
  const rulesInput = await vscode.window.showInputBox({
    prompt: '请输入 Cursor 的全局用户规则（每行一条规则，或使用换行分隔）',
    placeHolder: '例如：\nUse OpenSkills\nAlways respond in Chinese-simplified',
    ignoreFocusOut: true,
  });

  if (!rulesInput || !rulesInput.trim()) {
    vscode.window.showInformationMessage('已取消同步 Cursor 用户规则');
    return;
  }

  // 解析规则
  const rules: CursorUserRule[] = [];
  const lines = rulesInput.split('\n').filter(line => line.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      rules.push({
        content: line,
        description: `规则 ${i + 1}`,
      });
    }
  }

  if (rules.length === 0) {
    vscode.window.showWarningMessage('没有有效的规则内容');
    return;
  }

  // 同步规则
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '同步 Cursor 用户规则',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: '正在同步规则...' });
      
      const result = await syncCursorUserRules(rules);
      
      if (result.success) {
        vscode.window.showInformationMessage(
          `成功同步 ${result.exported || 0} 条 Cursor 用户规则到 ~/.cursor/rules/cursor-user-rules.mdc`
        );
        outputChannel.appendLine(`[Cursor Rules] 成功同步 ${result.exported || 0} 条规则`);
      } else {
        vscode.window.showErrorMessage(
          `同步 Cursor 用户规则失败: ${result.error}`
        );
        outputChannel.appendLine(`[Cursor Rules] 同步失败: ${result.error}`);
        outputChannel.show();
      }
    }
  );
}
