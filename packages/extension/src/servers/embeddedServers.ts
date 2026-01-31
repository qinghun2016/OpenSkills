/**
 * 插件内嵌前后端服务：随扩展激活自动启动 API 与 Web，停用时关闭
 * 启动前检查端口占用；若被非本服务占用则换端口并通知用户
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import { spawn, ChildProcess } from 'child_process';
import { getWorkspaceRoot } from '../utils/paths';

let apiProcess: ChildProcess | null = null;
let webProcess: ChildProcess | null = null;
/** 实际使用的 API 端口（启动后设置，供客户端与面板使用） */
let actualApiPort: number | null = null;
/** 实际使用的 Web 端口（启动后设置） */
let actualWebPort: number | null = null;

const DEFAULT_API_PORT = 3847;
const DEFAULT_WEB_PORT = 3848;

export function getActualApiPort(): number | null {
  return actualApiPort;
}

export function getActualWebPort(): number | null {
  return actualWebPort;
}

/**
 * 是否启用自动启动
 */
function shouldAutoStart(): boolean {
  return vscode.workspace.getConfiguration('openskills').get<boolean>('autoStartServers') ?? true;
}

function getApiPort(): number {
  return vscode.workspace.getConfiguration('openskills').get<number>('apiPort') ?? DEFAULT_API_PORT;
}

function getWebPort(): number {
  return vscode.workspace.getConfiguration('openskills').get<number>('webPort') ?? DEFAULT_WEB_PORT;
}

/**
 * 检测端口是否被占用
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer(s => s.end());
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * 检测指定端口是否为 OpenSkills API（GET /api/health 返回 success/status）
 */
function isOurApiOnPort(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res: http.IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json && (json.success === true || json.status === 'healthy'));
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 寻找一个可用的端口（从 start 开始递增尝试）
 */
async function findAvailablePort(start: number, excludePort?: number): Promise<number> {
  for (let p = start; p < 65536; p++) {
    if (excludePort !== undefined && p === excludePort) continue;
    const inUse = await isPortInUse(p);
    if (!inUse) return p;
  }
  return start;
}

/**
 * 启动 API 服务（Node 进程）
 * @param apiPath 已解析的 API 目录（扩展内 resources/servers/api 或 workspace packages/api）
 */
function startApi(apiPath: string, workspaceRoot: string, apiPort: number, outputChannel: vscode.OutputChannel): Promise<void> {
  return new Promise((resolve, reject) => {
  const distPath = path.join(apiPath, 'dist', 'index.js');
  if (!fs.existsSync(distPath)) {
      outputChannel.appendLine('[Servers] API 未编译，请先在 packages/api 下执行 npm run build');
      reject(new Error('API dist not found'));
      return;
    }

    const env = {
      ...process.env,
      PORT: String(apiPort),
      WORKSPACE_ROOT: workspaceRoot,
      OPENSKILLS_PROCESS_NAME: 'OpenSkills API',
    };

    const child = spawn('node', [distPath], {
      cwd: apiPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    apiProcess = child;
    child.stdout?.on('data', (data: Buffer) => {
      outputChannel.appendLine(`[API] ${data.toString().trim()}`);
    });
    child.stderr?.on('data', (data: Buffer) => {
      outputChannel.appendLine(`[API] ${data.toString().trim()}`);
    });
    child.on('error', (err) => {
      outputChannel.appendLine(`[API] 启动错误: ${err.message}`);
      apiProcess = null;
      reject(err);
    });
    child.on('exit', (code, signal) => {
      apiProcess = null;
      if (code !== null && code !== 0) {
        outputChannel.appendLine(`[API] 进程退出 code=${code} signal=${signal}`);
      }
    });

    // 简单等待端口可连接再 resolve
    const check = (): void => {
      const req = http.get(`http://127.0.0.1:${apiPort}/api/health`, (res: http.IncomingMessage) => {
        if (res.statusCode === 200) {
          outputChannel.appendLine(`[Servers] API 已就绪 http://localhost:${apiPort}`);
          outputChannel.appendLine('[Servers] API 请求与错误会显示在下方 [API] 行；若使用 npm run dev 在终端启动的 API，请查看终端输出。');
          resolve();
        } else {
          setTimeout(check, 300);
        }
      });
      req.on('error', () => setTimeout(check, 300));
      req.setTimeout(15000, () => {
        req.destroy();
        setTimeout(check, 300);
      });
    };
    setTimeout(check, 500);
  });
}

/**
 * 启动 Web 服务（捆绑模式：静态 + /api 代理）
 */
function startWebBundled(extensionPath: string, apiPort: number, webPort: number, outputChannel: vscode.OutputChannel): void {
  const serveScript = path.join(extensionPath, 'resources', 'servers', 'serve-web.js');
  const webDist = path.join(extensionPath, 'resources', 'servers', 'web', 'dist');
  if (!fs.existsSync(serveScript) || !fs.existsSync(webDist)) {
    outputChannel.appendLine('[Servers] 捆绑 Web 资源不存在，跳过启动');
    return;
  }
  const env = {
    ...process.env,
    PORT: String(webPort),
    API_PORT: String(apiPort),
    SERVE_ROOT: webDist,
    OPENSKILLS_PROCESS_NAME: 'OpenSkills Web',
  };
  // Do not use shell: true — on Windows spawn would return the shell process, not node;
  // killing it would leave the actual node (serve-web.js) orphaned and holding the extension dir.
  const child = spawn('node', [serveScript], {
    cwd: path.dirname(serveScript),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  webProcess = child;
  child.stdout?.on('data', (data: Buffer) => {
    outputChannel.appendLine(`[Web] ${data.toString().trim()}`);
  });
  child.stderr?.on('data', (data: Buffer) => {
    outputChannel.appendLine(`[Web] ${data.toString().trim()}`);
  });
  child.on('error', (err) => {
    outputChannel.appendLine(`[Web] 启动错误: ${err.message}`);
    webProcess = null;
  });
  child.on('exit', (code, signal) => {
    webProcess = null;
    if (code !== null && code !== 0) {
      outputChannel.appendLine(`[Web] 进程退出 code=${code} signal=${signal}`);
    }
  });
  outputChannel.appendLine(`[Servers] Web 启动中（捆绑） http://localhost:${webPort}`);
}

/**
 * 启动 Web 服务（开发模式：Vite 开发服务器）
 */
function startWeb(extensionPath: string, apiPort: number, webPort: number, outputChannel: vscode.OutputChannel): void {
  const webPath = path.join(extensionPath, '..', 'web');
  const packageJsonPath = path.join(webPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    outputChannel.appendLine('[Servers] Web 包不存在，跳过启动');
    return;
  }

  const env = {
    ...process.env,
    VITE_API_URL: `http://localhost:${apiPort}`,
    OPENSKILLS_PROCESS_NAME: 'OpenSkills Web',
  };

  const isWin = process.platform === 'win32';
  const child = spawn('npx', ['vite', '--port', String(webPort)], {
    cwd: webPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  });

  webProcess = child;
  child.stdout?.on('data', (data: Buffer) => {
    outputChannel.appendLine(`[Web] ${data.toString().trim()}`);
  });
  child.stderr?.on('data', (data: Buffer) => {
    outputChannel.appendLine(`[Web] ${data.toString().trim()}`);
  });
  child.on('error', (err) => {
    outputChannel.appendLine(`[Web] 启动错误: ${err.message}`);
    webProcess = null;
  });
  child.on('exit', (code, signal) => {
    webProcess = null;
    if (code !== null && code !== 0) {
      outputChannel.appendLine(`[Web] 进程退出 code=${code} signal=${signal}`);
    }
  });
  outputChannel.appendLine(`[Servers] Web 启动中 http://localhost:${webPort}`);
}

const KILL_WAIT_MS = 3500;

/**
 * Destroy child process stdio streams so the extension host releases pipe FDs.
 * If we only kill the process without destroying these streams, the host may keep
 * file handles open and the extension directory can remain locked on Windows.
 */
function destroyChildStdio(proc: ChildProcess): void {
  try {
    if (proc.stdin && !proc.stdin.destroyed) proc.stdin.destroy();
  } catch {
    // ignore
  }
  try {
    if (proc.stdout && !proc.stdout.destroyed) proc.stdout.destroy();
  } catch {
    // ignore
  }
  try {
    if (proc.stderr && !proc.stderr.destroyed) proc.stderr.destroy();
  } catch {
    // ignore
  }
}

/**
 * Kill a child process and wait for it (and its tree on Windows) to exit so file handles are released.
 * Destroys stdio streams first so the extension host releases pipe FDs; required for clean uninstall.
 */
function killProcessTreeAsync(proc: ChildProcess | null): Promise<void> {
  if (!proc) return Promise.resolve();
  const pid = proc.pid;
  destroyChildStdio(proc);
  try {
    proc.kill('SIGKILL');
  } catch {
    // ignore
  }
  if (!pid || process.platform !== 'win32') {
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    const t = setTimeout(resolve, KILL_WAIT_MS);
    try {
      const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: true,
      });
      tk.on('exit', () => {
        clearTimeout(t);
        resolve();
      });
      tk.on('error', () => {
        clearTimeout(t);
        resolve();
      });
    } catch {
      clearTimeout(t);
      resolve();
    }
  });
}

/**
 * Stop all embedded API/Web servers and wait for processes to exit so the extension can be disabled/uninstalled
 * and the extension folder (openskills.openskills-0.1.0) can be removed.
 */
export async function stopEmbeddedServers(): Promise<void> {
  const api = apiProcess;
  const web = webProcess;
  apiProcess = null;
  webProcess = null;
  actualApiPort = null;
  actualWebPort = null;
  await Promise.all([killProcessTreeAsync(api), killProcessTreeAsync(web)]);
}

/**
 * Fallback: kill any node.exe process whose command line contains "openskills.openskills".
 * Used when deactivate runs but tracked apiProcess/webProcess were lost (e.g. extension reload)
 * or when shell:true was used and we only killed the shell, leaving node orphaned.
 * Call after stopEmbeddedServers() in deactivate.
 */
export function killOrphanProcessesInExtensionPath(_extensionPath?: string): void {
  if (process.platform !== 'win32') {
    return;
  }
  try {
    const { execSync } = require('child_process');
    const script = "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*openskills.openskills*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    execSync(`powershell -NoProfile -NonInteractive -Command "${script}"`, { stdio: 'ignore', timeout: 5000 });
  } catch {
    // ignore
  }
}

/**
 * 若配置启用，则启动 API 与 Web（在后台执行，不阻塞激活）
 * 若默认端口被非本服务占用，则换端口启动并通知用户
 */
export function startEmbeddedServersIfEnabled(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): void {
  if (!shouldAutoStart()) {
    outputChannel.appendLine('[Servers] 已关闭自动启动，请自行启动 API 与 Web');
    return;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    outputChannel.appendLine('[Servers] 未检测到工作区，跳过启动');
    return;
  }

  const extensionPath = context.extensionPath;
  const bundledApiPath = path.join(extensionPath, 'resources', 'servers', 'api');
  const bundledWebDist = path.join(extensionPath, 'resources', 'servers', 'web', 'dist');
  const workspaceApiPath = path.join(extensionPath, '..', 'api');
  const workspaceWebPath = path.join(extensionPath, '..', 'web');

  const useBundledApi = fs.existsSync(path.join(bundledApiPath, 'dist', 'index.js'));
  const useBundledWeb = fs.existsSync(path.join(bundledWebDist, 'index.html')) &&
    fs.existsSync(path.join(extensionPath, 'resources', 'servers', 'serve-web.js'));

  const apiPath = useBundledApi ? bundledApiPath : workspaceApiPath;
  const hasWorkspaceApi = fs.existsSync(path.join(workspaceApiPath, 'package.json'));
  const hasWorkspaceWeb = fs.existsSync(path.join(workspaceWebPath, 'package.json'));

  if (!useBundledApi && !hasWorkspaceApi) {
    outputChannel.appendLine('[Servers] 未找到 packages/api 或捆绑 API，跳过内嵌启动');
    return;
  }
  if (!useBundledWeb && !hasWorkspaceWeb) {
    outputChannel.appendLine('[Servers] 未找到 packages/web 或捆绑 Web，跳过内嵌启动');
    return;
  }
  if (useBundledApi) {
    outputChannel.appendLine('[Servers] 使用扩展内捆绑的 API');
  }
  if (useBundledWeb) {
    outputChannel.appendLine('[Servers] 使用扩展内捆绑的 Web');
  }

  const wantedApiPort = getApiPort();
  const wantedWebPort = getWebPort();

  (async () => {
    let apiPortToUse = wantedApiPort;
    let webPortToUse = wantedWebPort;

    // 检查 API 端口
    const apiInUse = await isPortInUse(wantedApiPort);
    let reusedApi = false;
    if (apiInUse) {
      const isOurs = await isOurApiOnPort(wantedApiPort);
      if (isOurs) {
        outputChannel.appendLine(`[Servers] 端口 ${wantedApiPort} 已被本插件 API 占用，将复用该服务`);
        actualApiPort = wantedApiPort;
        reusedApi = true;
      } else {
        apiPortToUse = await findAvailablePort(DEFAULT_API_PORT);
        outputChannel.appendLine(`[Servers] 端口 ${wantedApiPort} 已被其他进程占用（非 OpenSkills API），改用端口 ${apiPortToUse}`);
        vscode.window.showWarningMessage(
          `OpenSkills: 端口 ${wantedApiPort} 已被占用，API 已在端口 ${apiPortToUse} 启动。请在设置中确认或使用面板中的访问地址。`,
          '知道了'
        );
        actualApiPort = apiPortToUse;
      }
    } else {
      actualApiPort = wantedApiPort;
    }

    if (!reusedApi) {
      outputChannel.appendLine(`[Servers] 正在启动 API:${apiPortToUse} 与 Web:${webPortToUse} ...`);
      try {
        await startApi(apiPath, workspaceRoot, apiPortToUse, outputChannel);
      } catch (err) {
        outputChannel.appendLine(`[Servers] API 启动失败: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    // 检查 Web 端口（仅判断占用，不区分是否“我们的”）
    const webInUse = await isPortInUse(webPortToUse);
    if (webInUse) {
      webPortToUse = await findAvailablePort(DEFAULT_WEB_PORT, apiPortToUse);
      outputChannel.appendLine(`[Servers] Web 默认端口已被占用，改用端口 ${webPortToUse}`);
      vscode.window.showWarningMessage(
        `OpenSkills: Web 默认端口已被占用，已在端口 ${webPortToUse} 启动。访问地址: http://localhost:${webPortToUse}`,
        '知道了'
      );
    }
    actualWebPort = webPortToUse;
    if (useBundledWeb) {
      startWebBundled(extensionPath, apiPortToUse, webPortToUse, outputChannel);
    } else {
      startWeb(extensionPath, apiPortToUse, webPortToUse, outputChannel);
    }

    // 若 API 或 Web 使用了非默认端口，提示用户查看面板访问地址
    if (actualApiPort !== wantedApiPort || actualWebPort !== wantedWebPort) {
      outputChannel.appendLine(`[Servers] 当前 API: http://localhost:${actualApiPort}  Web: http://localhost:${actualWebPort}`);
    }
  })().catch(err => {
    outputChannel.appendLine(`[Servers] 启动过程异常: ${err instanceof Error ? err.message : String(err)}`);
  });
}
