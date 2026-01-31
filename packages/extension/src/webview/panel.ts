/**
 * OpenSkills Webview Panel
 * Embeds the Web service directly (no custom Dashboard)
 */

import * as vscode from 'vscode';
import { getWebUrl, openWebUrlInBrowser } from '../commands/openWeb';
import { getOutputChannel } from '../outputChannel';

export class OpenSkillsPanel {
  public static currentPanel: OpenSkillsPanel | undefined;
  public static readonly viewType = 'openskills.panel';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getLoadingHtml();
    this._update();

    // Handle messages from panel (open in browser, trigger wake from iframe)
    this._disposables.push(
      this._panel.webview.onDidReceiveMessage((msg: { type?: string; command?: string }) => {
        if (msg.type === 'openInBrowser') {
          openWebUrlInBrowser().catch((e) => {
            getOutputChannel().appendLine(`[Panel] openInBrowser failed: ${e instanceof Error ? e.message : String(e)}`);
          });
        } else if (msg.command === 'triggerWake') {
          void Promise.resolve(vscode.commands.executeCommand('openskills.triggerWake')).catch((e: unknown) => {
            getOutputChannel().appendLine(`[Panel] triggerWake failed: ${e instanceof Error ? e.message : String(e)}`);
          });
        }
      })
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // When user switches back to this panel tab, refresh so iframe (re)connects to web frontend
    this._disposables.push(
      this._panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.visible) this._update();
      })
    );
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (OpenSkillsPanel.currentPanel) {
      OpenSkillsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      OpenSkillsPanel.viewType,
      'OpenSkills',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    OpenSkillsPanel.currentPanel = new OpenSkillsPanel(panel, extensionUri);
  }

  public static refresh() {
    if (OpenSkillsPanel.currentPanel) {
      OpenSkillsPanel.currentPanel._update();
    }
  }

  public dispose() {
    OpenSkillsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  private _getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>OpenSkills</title></head>
<body style="font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 20px;">
  <p>正在加载 OpenSkills...</p>
</body>
</html>`;
  }

  private _update(): void {
    try {
      const webUrl = getWebUrl();
      const webview = this._panel.webview;

      // CSP: allow iframe, inline styles and script for open-in-browser button
      const csp = [
        "default-src 'none'",
        `frame-src ${webUrl} http://localhost:3847 http://localhost:3848 http://localhost:3000 http://localhost:5173`,
        "style-src 'unsafe-inline'",
        "script-src 'unsafe-inline'"
      ].join('; ');

      this._panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>OpenSkills</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; position: relative; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
    .error { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-errorForeground); }
    .open-browser-btn {
      position: absolute; top: 8px; right: 8px; z-index: 100;
      padding: 6px 12px; font-size: 12px; cursor: pointer;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 4px;
      font-family: var(--vscode-font-family);
    }
    .open-browser-btn:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <button class="open-browser-btn" id="openBrowserBtn" title="在系统默认浏览器中打开">在浏览器中打开</button>
  <iframe src="${escapeHtml(webUrl)}" title="OpenSkills Web"></iframe>
  <p class="hint" style="position:absolute;bottom:8px;left:8px;margin:0;font-size:11px;color:var(--vscode-descriptionForeground);">若页面长时间空白，请点击「在浏览器中打开」或确认 Web 服务已启动（如 npm run dev）</p>
  <script>
    (function() {
      var btn = document.getElementById('openBrowserBtn');
      var vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
      if (btn && vscode) {
        btn.addEventListener('click', function() { vscode.postMessage({ type: 'openInBrowser' }); });
      }
      if (vscode) {
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'openskills.triggerWake') {
            vscode.postMessage({ command: 'triggerWake' });
          }
        });
      }
    })();
  </script>
</body>
</html>`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      getOutputChannel().appendLine(`[Panel] Error: ${msg}`);
      this._panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>OpenSkills</title></head>
<body style="font-family: var(--vscode-font-family); padding: 20px;">
  <p class="error">加载失败: ${escapeHtml(msg)}</p>
  <p style="font-size: 12px;">请确保 Web 服务已启动，或运行「OpenSkills: 打开主页面」重试。</p>
</body>
</html>`;
    }
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

export function registerOpenPanelCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.openPanel', () => {
    OpenSkillsPanel.createOrShow(context.extensionUri);
  });
}
