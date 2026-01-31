/**
 * Agent CLI 工具函数
 * 用于通过 Cursor Agent CLI 执行各种操作
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import { getOutputChannel, getOpenSkillsAdminChannel } from '../outputChannel';

const execAsync = promisify(exec);

/**
 * 返回用于执行的 agent 可执行文件引用（带路径时含空格会加引号）
 */
function getAgentExecutable(resolvedPath?: string): string {
  if (!resolvedPath || resolvedPath === 'agent') return 'agent';
  return resolvedPath.includes(' ') ? `"${resolvedPath}"` : resolvedPath;
}

/**
 * 安全地解码命令输出，处理编码问题
 * Windows PowerShell 输出可能是 GBK 编码，需要正确转换
 */
function decodeOutput(buffer: Buffer | string | undefined): string {
  if (!buffer) return '';
  
  if (typeof buffer === 'string') {
    return buffer;
  }
  
  // 尝试 UTF-8 解码
  try {
    return buffer.toString('utf8');
  } catch {
    // 如果 UTF-8 失败，尝试 GBK（中文 Windows）
    try {
      // 使用 Buffer 的默认 toString，它会使用系统编码
      return buffer.toString();
    } catch {
      // 如果都失败，返回空字符串
      return '';
    }
  }
}

/**
 * 展开路径中的环境变量
 * Windows: %VAR% 格式
 * Unix: $VAR 或 ${VAR} 格式
 */
function expandEnvVars(inputPath: string): string {
  if (!inputPath) return inputPath;
  
  let expanded = inputPath;
  
  if (process.platform === 'win32') {
    // Windows: 展开 %VAR% 格式
    expanded = expanded.replace(/%([^%]+)%/g, (match, varName) => {
      return process.env[varName] || match; // 如果环境变量不存在，保留原样
    });
  } else {
    // Unix/Linux: 展开 $VAR 或 ${VAR} 格式
    expanded = expanded.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
    expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }
  
  return expanded;
}

/**
 * Agent CLI 检测结果
 */
export interface AgentCliCheckResult {
  available: boolean;
  /** 解析出的可执行文件完整路径，执行时优先使用此路径避免依赖 PATH */
  resolvedPath?: string;
  version?: string;
  error?: string;
  errorDetails?: string;
}

/**
 * 获取本地下载的 ripgrep 存放目录（Windows 无包管理器时的备用安装位置）
 * 导出供创建终端时将此处加入 PATH，使 agent 子进程能找到 rg
 */
export function getRipgrepToolsDir(): string {
  const base = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || process.env.USERPROFILE || os.homedir())
    : (process.env.HOME || os.homedir());
  return path.join(base, 'OpenSkills', 'tools', 'ripgrep');
}

/**
 * 检测 ripgrep (rg) 是否可用
 * Cursor Agent CLI 依赖 rg 进行代码搜索，未安装时 agent chat 会报错
 * 会同时检查系统 PATH 与本地备用目录 getRipgrepToolsDir()
 * @param extraPath 可选，安装后追加的搜索路径（用于安装后立即检测）
 */
export async function checkRipgrepAvailable(extraPath?: string): Promise<boolean> {
  try {
    const isWindows = process.platform === 'win32';
    let fullPath = isWindows
      ? `${process.env.PATH};${process.env.USERPROFILE}\\.local\\bin;${process.env.ProgramFiles || ''}\\ripgrep;${process.env['ProgramFiles(x86)'] || ''}\\ripgrep`
      : `${process.env.PATH}:${process.env.HOME}/.local/bin`;
    const scoopShims = process.env.USERPROFILE ? `${process.env.USERPROFILE}\\scoop\\shims` : '';
    if (isWindows && scoopShims) {
      fullPath = `${fullPath};${scoopShims}`;
    }
    const localRipgrep = getRipgrepToolsDir();
    if (fs.existsSync(localRipgrep)) {
      fullPath = isWindows ? `${fullPath};${localRipgrep}` : `${fullPath}:${localRipgrep}`;
    }
    if (extraPath) {
      fullPath = isWindows ? `${fullPath};${extraPath}` : `${fullPath}:${extraPath}`;
    }
    const { stdout } = await execAsync('rg --version', {
      timeout: 5000,
      encoding: 'utf8',
      env: { ...process.env, PATH: fullPath }
    });
    return Boolean(stdout && stdout.includes('ripgrep'));
  } catch {
    return false;
  }
}

/** 自动安装 ripgrep 的结果 */
export interface InstallRipgrepResult {
  installed: boolean;
  method?: string;
  error?: string;
}

/** 通用依赖安装结果（供 ensure 流程使用） */
export interface InstallDependencyResult {
  installed: boolean;
  method?: string;
  error?: string;
}

/** 外部依赖定义：检测 + 自动安装，便于扩展更多依赖 */
export interface ExternalDependency {
  name: string;
  /** 检测是否已安装 */
  check: () => Promise<boolean>;
  /** 尝试自动安装，返回是否安装成功及错误提示 */
  install: () => Promise<InstallDependencyResult>;
}

/** 单个依赖 ensure 结果 */
export interface EnsureDependencyResult {
  name: string;
  ok: boolean;
  installed?: boolean;
  method?: string;
  error?: string;
}

/**
 * 确保单个依赖可用：先检测，缺失则尝试安装后再检测
 */
export async function ensureDependency(dep: ExternalDependency): Promise<EnsureDependencyResult> {
  let ok = await dep.check();
  if (ok) return { name: dep.name, ok: true };
  const installResult = await dep.install();
  if (installResult.installed) {
    ok = await dep.check();
    if (ok) return { name: dep.name, ok: true, installed: true, method: installResult.method };
  }
  return {
    name: dep.name,
    ok: false,
    error: installResult.error || `${dep.name} 未安装且自动安装未成功`
  };
}

/**
 * 确保一组依赖全部可用；按顺序执行，每个缺失时先尝试安装
 * @returns 全部成功为 true，以及每个依赖的结果列表
 */
export async function ensureDependencies(
  deps: ExternalDependency[]
): Promise<{ allOk: boolean; results: EnsureDependencyResult[] }> {
  const results: EnsureDependencyResult[] = [];
  for (const dep of deps) {
    const r = await ensureDependency(dep);
    results.push(r);
  }
  const allOk = results.every(r => r.ok);
  return { allOk, results };
}

/** 唤醒流程所需的外部依赖列表（可扩展：将来若有 git/node 等需求，在此追加） */
export const WAKE_DEPENDENCIES: ExternalDependency[] = [
  {
    name: 'ripgrep (rg)',
    check: () => checkRipgrepAvailable(),
    install: () => installRipgrep()
  }
];

/**
 * 确保唤醒所需依赖全部可用；缺失时依次尝试自动安装
 */
export async function ensureWakeDependencies(): Promise<{
  allOk: boolean;
  results: EnsureDependencyResult[];
}> {
  return ensureDependencies(WAKE_DEPENDENCIES);
}

/**
 * 在 Windows 下执行命令时使用 shell，以便找到 winget/choco/scoop（常不在扩展进程 PATH 中）
 */
function execWithShellOnWindows(cmd: string, timeoutMs: number): Promise<void> {
  const isWindows = process.platform === 'win32';
  const opts: Parameters<typeof execAsync>[1] = {
    timeout: timeoutMs,
    encoding: 'utf8',
    env: { ...process.env }
  };
  if (isWindows) {
    (opts as { shell?: string }).shell = 'cmd.exe';
    (opts as { windowsHide?: boolean }).windowsHide = true;
  }
  return execAsync(cmd, opts).then(() => {});
}

/**
 * 通过 https 获取 URL 返回的 JSON（支持一次重定向）
 */
function httpsGetJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OpenSkills-Extension' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          httpsGetJson<T>(loc).then(resolve, reject);
          return;
        }
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (ch: string) => { body += ch; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * 下载文件到指定路径（支持一次重定向，校验状态码并等待写入完成）
 */
function httpsDownloadToFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OpenSkills-Extension' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          httpsDownloadToFile(loc, destPath).then(resolve, reject);
          return;
        }
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`下载返回状态码 ${res.statusCode || 'unknown'}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.on('error', (err) => {
        file.destroy();
        fs.unlink(destPath, () => {});
        reject(err);
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
      file.on('close', () => resolve());
      file.on('finish', () => file.close());
      res.pipe(file);
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('下载超时(90s)')); });
  });
}

/**
 * Windows 备用：从 GitHub 下载 ripgrep 并解压到本地目录（无需 winget/choco/scoop）
 * 会向 OpenSkills 输出通道写入步骤与错误详情，便于排查“是否已下载、是否解压失败”等
 */
async function downloadRipgrepFromGitHub(): Promise<InstallRipgrepResult> {
  if (process.platform !== 'win32') {
    return { installed: false, error: '仅支持 Windows' };
  }
  const out = getOutputChannel();
  const log = (msg: string) => { out.appendLine(`[ripgrep 下载] ${msg}`); };

  try {
    interface GhAsset {
      name: string;
      browser_download_url: string;
    }
    interface GhRelease {
      assets: GhAsset[];
    }
    log('正在从 GitHub 获取最新发行信息...');
    const release = await httpsGetJson<GhRelease>(
      'https://api.github.com/repos/BurntSushi/ripgrep/releases/latest'
    );
    const asset = release?.assets?.find(
      (a) => a.name.includes('x86_64-pc-windows-msvc') && a.name.endsWith('.zip')
    );
    if (!asset?.browser_download_url) {
      return { installed: false, error: '未找到 Windows 版 ripgrep 发行包' };
    }
    log(`找到发行包: ${asset.name}`);

    const toolsDir = getRipgrepToolsDir();
    const tmpDir = path.join(os.tmpdir(), `ripgrep-dl-${Date.now()}`);
    const zipPath = path.join(tmpDir, asset.name);
    fs.mkdirSync(tmpDir, { recursive: true });

    log(`正在下载到临时目录: ${tmpDir}`);
    await httpsDownloadToFile(asset.browser_download_url, zipPath);
    if (!fs.existsSync(zipPath)) {
      return { installed: false, error: '下载后本地未找到 zip 文件' };
    }
    const stat = fs.statSync(zipPath);
    log(`下载完成，大小: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
    if (stat.size < 1000) {
      return { installed: false, error: `下载文件过小(${stat.size} 字节)，可能未完整下载` };
    }

    fs.mkdirSync(toolsDir, { recursive: true });
    const psPath = zipPath.replace(/'/g, "''");
    const psDest = tmpDir.replace(/'/g, "''");
    const expandCmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${psPath}' -DestinationPath '${psDest}' -Force"`;
    log('正在解压...');
    try {
      const { stderr } = await execAsync(expandCmd, { timeout: 60000, encoding: 'utf8' });
      if (stderr && String(stderr).trim()) log(`PowerShell  stderr: ${stderr}`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const stderr = e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr?: string }).stderr) : '';
      log(`解压失败: ${errMsg}`);
      if (stderr) log(`stderr: ${stderr}`);
      return { installed: false, error: `解压失败: ${errMsg}${stderr ? '；' + stderr : ''}` };
    }

    const extracted = fs.readdirSync(tmpDir).find((n) => n.startsWith('ripgrep-') && n.endsWith('-x86_64-pc-windows-msvc'));
    if (!extracted) {
      const list = fs.readdirSync(tmpDir).join(', ') || '(空)';
      log(`解压后目录内容: ${list}`);
      return { installed: false, error: `解压后未找到 ripgrep 目录，当前内容: ${list}` };
    }
    const innerDir = path.join(tmpDir, extracted);
    const files = fs.readdirSync(innerDir);
    log(`复制到本地目录: ${toolsDir}`);
    const essentialFiles = ['rg.exe', 'rg.1']; // 必需文件：可执行文件 + man page（可选）
    let copiedCount = 0;
    let failedFiles: string[] = [];
    for (const f of files) {
      try {
        fs.copyFileSync(path.join(innerDir, f), path.join(toolsDir, f));
        copiedCount++;
      } catch (e) {
        const isEssential = essentialFiles.some(ef => f.toLowerCase().includes(ef.toLowerCase()));
        const errMsg = e instanceof Error ? e.message : String(e);
        if (isEssential) {
          // 必需文件（如 rg.exe）复制失败则抛出
          throw new Error(`复制必需文件 ${f} 失败: ${errMsg}`);
        } else {
          // 非必需文件（如 complete, README）失败则跳过
          failedFiles.push(`${f}(${errMsg})`);
        }
      }
    }
    if (failedFiles.length > 0) {
      log(`部分非必需文件复制失败，已跳过: ${failedFiles.join(', ')}`);
    }
    log(`已复制 ${copiedCount}/${files.length} 个文件`);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }

    const rgExe = path.join(toolsDir, 'rg.exe');
    if (!fs.existsSync(rgExe)) {
      return { installed: false, error: `解压后未找到 rg.exe，目录内容: ${fs.readdirSync(toolsDir).join(', ')}` };
    }
    log(`rg.exe 已就绪: ${rgExe}`);
    const ok = await checkRipgrepAvailable(toolsDir);
    if (ok) {
      log('ripgrep 已通过 GitHub 安装并可用');
      return { installed: true, method: 'github' };
    }
    return { installed: false, error: '下载并解压完成，但当前进程内 rg 仍不可用（可尝试重新触发唤醒）' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`异常: ${msg}`);
    if (e instanceof Error && e.stack) log(e.stack);
    return { installed: false, error: `GitHub 下载或解压异常: ${msg}` };
  }
}

/**
 * 尝试自动安装 ripgrep (rg)
 * Windows: 依次尝试 winget、choco、scoop（使用 shell 以正确找到包管理器）；macOS: brew；Linux: apt
 * 安装成功后新终端可能才生效，本进程内会再次检测 rg
 */
export async function installRipgrep(): Promise<InstallRipgrepResult> {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    // 1. winget（Windows 10/11 常见）- 使用 shell 以便系统 PATH 中有 winget
    try {
      await execWithShellOnWindows(
        'winget install --id BurntSushi.ripgrep.GNU --accept-package-agreements --accept-source-agreements',
        120000
      );
      const ok = await checkRipgrepAvailable();
      if (ok) return { installed: true, method: 'winget' };
    } catch (e) {
      // 忽略，尝试下一个
    }

    // 2. Chocolatey
    try {
      await execWithShellOnWindows('choco install ripgrep -y', 120000);
      const ok = await checkRipgrepAvailable();
      if (ok) return { installed: true, method: 'chocolatey' };
    } catch (e) {
      // 忽略
    }

    // 3. Scoop
    try {
      await execWithShellOnWindows('scoop install ripgrep', 120000);
      const ok = await checkRipgrepAvailable();
      if (ok) return { installed: true, method: 'scoop' };
    } catch (e) {
      // 忽略
    }

    // 4. 备用：从 GitHub 下载 Windows 版并解压到本地目录（无需 winget/choco/scoop）
    try {
      const result = await downloadRipgrepFromGitHub();
      if (result.installed) return result;
    } catch (e) {
      const out = getOutputChannel();
      out.appendLine('[触发唤醒] GitHub 备用安装异常: ' + (e instanceof Error ? e.message : String(e)));
    }

    return {
      installed: false,
      error: '自动安装失败（未检测到 winget/choco/scoop 或 GitHub 下载未完成）。请手动安装：choco install ripgrep、scoop install ripgrep，或从 https://github.com/BurntSushi/ripgrep/releases 下载 Windows 版解压并将 rg.exe 所在目录加入 PATH。'
    };
  }

  if (isMac) {
    try {
      await execAsync('brew install ripgrep', {
        timeout: 120000,
        encoding: 'utf8',
        env: { ...process.env }
      });
      const ok = await checkRipgrepAvailable();
      if (ok) return { installed: true, method: 'brew' };
    } catch (e) {
      return {
        installed: false,
        error: '自动安装失败（请确认已安装 Homebrew）。请手动运行: brew install ripgrep'
      };
    }
  }

  // Linux：尝试 apt（可能需 sudo，扩展内可能无法静默）
  try {
    await execAsync('apt-get install -y ripgrep 2>/dev/null || sudo apt-get install -y ripgrep 2>/dev/null', {
      timeout: 60000,
      encoding: 'utf8',
      env: { ...process.env }
    });
    const ok = await checkRipgrepAvailable();
    if (ok) return { installed: true, method: 'apt' };
  } catch (e) {
    // 忽略
  }
  return {
    installed: false,
    error: '请手动安装 ripgrep：sudo apt-get install ripgrep 或从 https://github.com/BurntSushi/ripgrep/releases 下载。'
  };
}

/**
 * 获取可能的 Agent CLI 路径
 */
function getPossibleAgentPaths(): string[] {
  const paths: string[] = [];
  
  // 首先检查用户配置的路径
  try {
    const config = vscode.workspace.getConfiguration('openskills');
    const customPath = config.get<string>('agentCliPath', '');
    if (customPath && customPath.trim()) {
      paths.push(customPath.trim());
    }
  } catch (error) {
    // 配置读取失败，继续
  }
  
  // 然后尝试直接使用 PATH 中的 agent
  paths.push('agent');
  
  // Windows 常见路径
  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const appData = process.env.APPDATA || '';
    
    if (userProfile) {
      // ~/.local/bin/agent.exe (Windows)
      paths.push(path.join(userProfile, '.local', 'bin', 'agent.exe'));
      paths.push(path.join(userProfile, '.local', 'bin', 'agent'));
      // AppData\Local 路径
      paths.push(path.join(userProfile, 'AppData', 'Local', 'Programs', 'cursor', 'resources', 'app', 'bin', 'agent.exe'));
      paths.push(path.join(userProfile, 'AppData', 'Local', 'Programs', 'Cursor', 'resources', 'app', 'bin', 'agent.exe'));
    }
    
    if (localAppData) {
      paths.push(path.join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'bin', 'agent.exe'));
      paths.push(path.join(localAppData, 'Programs', 'Cursor', 'resources', 'app', 'bin', 'agent.exe'));
    }
    
    // 系统路径
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    paths.push(path.join(programFiles, 'Cursor', 'resources', 'app', 'bin', 'agent.exe'));
    paths.push(path.join(programFilesX86, 'Cursor', 'resources', 'app', 'bin', 'agent.exe'));
    
    // 检查 Cursor 的实际安装路径（从环境变量或常见位置）
    // Cursor 可能安装在非标准位置
    const cursorPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'resources', 'app', 'bin', 'agent.exe'),
      path.join(process.env.APPDATA || '', 'cursor', 'resources', 'app', 'bin', 'agent.exe'),
    ];
    paths.push(...cursorPaths.filter(p => p && !p.includes('undefined')));
    
    // 检查 PATH 环境变量中的所有路径（合并之前的 cursor 路径检查）
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter);
    for (const dir of pathDirs) {
      if (dir && dir.trim()) {
        // 展开环境变量（如 %NODE_HOME%）
        const expandedDir = expandEnvVars(dir.trim());
        if (expandedDir && expandedDir !== dir.trim()) {
          // 如果展开后路径不同，使用展开后的路径
          paths.push(path.join(expandedDir, 'agent.exe'));
          paths.push(path.join(expandedDir, 'agent'));
        }
        // 也保留原始路径（以防某些情况下需要）
        paths.push(path.join(dir.trim(), 'agent.exe'));
        paths.push(path.join(dir.trim(), 'agent'));
      }
    }
  } else {
    // Unix/Linux/Mac 路径
    const home = process.env.HOME || '';
    if (home) {
      paths.push(path.join(home, '.local', 'bin', 'agent'));
      paths.push(path.join(home, '.cargo', 'bin', 'agent'));
    }
    paths.push('/usr/local/bin/agent');
    paths.push('/usr/bin/agent');
    
    // 检查 PATH 环境变量中的所有路径
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(':');
    for (const dir of pathDirs) {
      if (dir && dir.trim()) {
        paths.push(path.join(dir.trim(), 'agent'));
      }
    }
  }
  
  return paths;
}

/**
 * 同步解析 agent 可执行文件的完整路径（用于 spawn，避免 ENOENT）。
 * 当 checkAgentCliAvailable 的 resolvedPath 未传入时，spawn 无法找到 'agent'，
 * 因 Extension Development Host 等场景下 PATH 可能不包含 agent 所在目录。
 */
function resolveAgentPathSync(agentPath?: string): string {
  if (agentPath && agentPath !== 'agent' && fs.existsSync(agentPath)) {
    return agentPath;
  }
  const paths = getPossibleAgentPaths();
  for (const p of paths) {
    if (p === 'agent') continue; // 相对路径，spawn 可能找不到
    const expanded = expandEnvVars(p);
    if (path.isAbsolute(expanded) && fs.existsSync(expanded)) {
      return expanded;
    }
  }
  return 'agent'; // 回退，依赖 PATH（可能仍 ENOENT，但至少尝试了）
}

/**
 * 检测 Cursor Agent CLI 是否可用
 * 返回检测结果对象，包含是否可用、版本信息、错误信息等
 */
export async function checkAgentCliAvailable(outputChannel?: vscode.OutputChannel): Promise<AgentCliCheckResult> {
  const isWindows = process.platform === 'win32';
  let lastError: Error | null = null;

  if (outputChannel) {
    outputChannel.appendLine('[Agent CLI] 开始检测 Cursor Agent CLI...');
  }

  // 首先尝试使用 PowerShell 执行（这样可以利用 PowerShell 的 PATH 环境变量）
  // 在 Windows 上，PowerShell 的 PATH 可能包含用户配置的路径
  let command: string | undefined;
  let shell: string | undefined;
  let agentPath: string | undefined;
  
  try {
    
    if (isWindows) {
      // Windows: 使用多种方法尝试找到 agent
      // 方法1: 使用 PowerShell 的 Get-Command（加载用户的 Profile）
      if (outputChannel) {
        outputChannel.appendLine('[Agent CLI] 方法1: 使用 PowerShell Get-Command 查找 agent...');
      }
      try {
        // 设置 PowerShell 输出为 UTF-8，避免中文乱码
        const psCommand = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Command agent -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source';
        const psResult = await execAsync(`powershell.exe -NonInteractive -Command "${psCommand}"`, {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8' // 明确指定编码
        });
        const psOutput = decodeOutput(psResult.stdout || psResult.stderr).trim();
        // 过滤掉错误信息和空行
        const lines = psOutput.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.includes('Get-Command') && !l.includes('ErrorAction') && !l.includes('CategoryInfo') && !l.includes('ObjectNotFound'));
        if (lines.length > 0 && lines[0]) {
          agentPath = lines[0];
          if (outputChannel) {
            outputChannel.appendLine(`[Agent CLI] ✅ 通过 Get-Command 找到 agent: ${agentPath}`);
          }
        } else {
          if (outputChannel) {
            outputChannel.appendLine('[Agent CLI] ⚠️ Get-Command 未找到 agent');
          }
        }
      } catch (psError) {
        if (outputChannel) {
          outputChannel.appendLine(`[Agent CLI] ⚠️ Get-Command 执行失败: ${psError instanceof Error ? psError.message : String(psError)}`);
        }
      }
      
      // 方法2: 如果 Get-Command 失败，尝试在 PATH 中搜索 agent.exe
      if (!agentPath || !fs.existsSync(agentPath)) {
        if (outputChannel) {
          outputChannel.appendLine('[Agent CLI] 方法2: 在 PATH 中搜索 agent.exe...');
        }
        try {
          // 设置 PowerShell 输出为 UTF-8
          const searchCommand = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $env:PATH -split \';\' | ForEach-Object { $dir = $_.Trim(); if ($dir -and (Test-Path "$dir\\agent.exe")) { "$dir\\agent.exe"; break } }';
          const searchResult = await execAsync(`powershell.exe -NonInteractive -Command "${searchCommand}"`, {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
            encoding: 'utf8' // 明确指定编码
          });
          const searchOutput = decodeOutput(searchResult.stdout || searchResult.stderr).trim();
          const searchLines = searchOutput.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.includes('Test-Path') && !l.includes('ForEach-Object'));
          if (searchLines.length > 0 && searchLines[0]) {
            agentPath = searchLines[0];
            if (outputChannel) {
              outputChannel.appendLine(`[Agent CLI] ✅ 在 PATH 中找到 agent: ${agentPath}`);
            }
          } else {
            if (outputChannel) {
              outputChannel.appendLine('[Agent CLI] ⚠️ PATH 中未找到 agent.exe');
            }
          }
        } catch (searchError) {
          if (outputChannel) {
            outputChannel.appendLine(`[Agent CLI] ⚠️ PATH 搜索失败: ${searchError instanceof Error ? searchError.message : String(searchError)}`);
          }
        }
      }
      
      // 如果找到了完整路径，使用完整路径
      if (agentPath && fs.existsSync(agentPath)) {
        command = `"${agentPath}" --version`;
        shell = undefined; // 使用完整路径时不需要 shell
        if (outputChannel) {
          outputChannel.appendLine(`[Agent CLI] 方法3: 使用完整路径执行: ${command}`);
        }
      } else {
        // 如果没有找到完整路径，跳过方法3，直接进入方法4（直接路径检测）
        // 因为 PowerShell 可能无法找到 agent 命令（即使它在用户的交互式 PowerShell 中可用）
        if (outputChannel) {
          outputChannel.appendLine('[Agent CLI] ⚠️ 方法1和2未找到 agent，跳过方法3，直接进入方法4（直接路径检测）...');
        }
        // 设置一个标志，让后续代码知道需要进入方法4
        agentPath = undefined;
        command = undefined as any; // 标记为未设置
        shell = undefined;
      }
    } else {
      // Unix/Linux: 使用 sh
      shell = '/bin/sh';
      command = 'agent --version';
    }
    
    // 只有在 command 和 shell 都设置时才执行（Windows 上如果未找到路径，command 会是 undefined）
    if (command && shell !== undefined) {
      try {
        // 获取完整的 PATH 环境变量（包括用户和系统 PATH）
        // 添加 Cursor 可能的安装路径
        const cursorBinPaths = isWindows ? [
          `${process.env.USERPROFILE}\\.local\\bin`,
          `${process.env.LOCALAPPDATA}\\Programs\\cursor\\resources\\app\\bin`,
          `D:\\MyTools\\cursor\\resources\\app\\bin`, // 用户可能的安装路径
          `${process.env['ProgramFiles']}\\Cursor\\resources\\app\\bin`,
          `${process.env['ProgramFiles(x86)']}\\Cursor\\resources\\app\\bin`,
        ].filter(p => p && !p.includes('undefined')).join(';') : [
          `${process.env.HOME}/.local/bin`,
          `${process.env.HOME}/.cargo/bin`,
        ].join(':');
        
        const fullPath = isWindows 
          ? `${process.env.PATH};${cursorBinPaths}`
          : `${process.env.PATH}:${cursorBinPaths}`;
        
        const execOptions: any = {
          timeout: 5000,
          maxBuffer: 1024 * 1024, // 1MB
          encoding: 'utf8', // 明确指定 UTF-8 编码
          env: { ...process.env, PATH: fullPath }
        };
        
        if (shell) {
          execOptions.shell = shell;
        }
        
        const { stdout, stderr } = await execAsync(command, execOptions);
        
        const version = decodeOutput(stdout || stderr).trim();
        
        if (outputChannel) {
          outputChannel.appendLine(`[Agent CLI] ✅ 检测成功！版本: ${version || '未知'}`);
        }
        
        // 如果成功，尝试检查 chat 命令
        try {
          const chatCommand = agentPath && fs.existsSync(agentPath) 
            ? `"${agentPath}" chat --help`
            : 'agent chat --help';
          const chatShell = agentPath && fs.existsSync(agentPath) ? undefined : shell;
          const chatFullPath = isWindows 
            ? `${process.env.PATH};${process.env.USERPROFILE}\\.local\\bin;${process.env.LOCALAPPDATA}\\Programs\\cursor\\resources\\app\\bin`
            : `${process.env.PATH}:${process.env.HOME}/.local/bin:${process.env.HOME}/.cargo/bin`;
          const chatOptions: any = {
            timeout: 3000,
            maxBuffer: 1024 * 1024,
            env: { ...process.env, PATH: chatFullPath }
          };
          if (chatShell) {
            chatOptions.shell = chatShell;
          }
          await execAsync(chatCommand, chatOptions);
        } catch (chatError) {
          // chat 命令可能不存在或需要参数，这是正常的
          // 只要 --version 能工作，就认为 CLI 可用
        }
        
        return {
          available: true,
          resolvedPath: agentPath && fs.existsSync(agentPath) ? agentPath : undefined,
          version: version || '未知版本'
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (outputChannel) {
          outputChannel.appendLine(`[Agent CLI] ⚠️ Shell 执行失败: ${lastError.message}`);
          outputChannel.appendLine(`[Agent CLI] 继续尝试直接路径检测...`);
        }
      }
    } else {
      // Windows 上如果未找到路径，跳过方法3，直接进入方法4
      if (outputChannel) {
        outputChannel.appendLine('[Agent CLI] 跳过方法3（Shell 执行），直接进入方法4（直接路径检测）...');
      }
    }
  } catch (error) {
    // 方法1-3 失败，继续尝试方法4
    lastError = error instanceof Error ? error : new Error(String(error));
    if (outputChannel) {
      outputChannel.appendLine(`[Agent CLI] ⚠️ 方法1-3执行失败: ${lastError.message}`);
      outputChannel.appendLine(`[Agent CLI] 继续尝试方法4（直接路径检测）...`);
    }
  }

  // 如果 shell 执行失败，尝试直接路径（先检查文件是否存在）
  if (outputChannel) {
    outputChannel.appendLine('[Agent CLI] 方法4: 尝试直接路径检测...');
  }
  const possiblePaths = getPossibleAgentPaths();
  let triedCount = 0;
  for (const agentPath of possiblePaths) {
    // 不跳过 'agent'：在 Windows 上方法 1–3 可能因 PATH/Profile 差异未找到路径，
    // 此处用 PowerShell 执行 agent --version 会加载用户 Profile，与终端行为一致
    triedCount++;
    if (triedCount <= 5 && outputChannel) {
      outputChannel.appendLine(`[Agent CLI] 尝试路径 ${triedCount}: ${agentPath}`);
    }
    
    // 先检查文件是否存在（避免不必要的执行）
    try {
      // 展开路径中的环境变量
      const expandedPath = expandEnvVars(agentPath);
      
      // 对于相对路径（如 'agent'），直接尝试执行
      // 对于绝对路径，先检查文件是否存在
      const isAbsolutePath = path.isAbsolute(expandedPath);
      if (isAbsolutePath && !fs.existsSync(expandedPath)) {
        // 如果展开后的路径不存在，也尝试原始路径（以防环境变量未设置）
        if (expandedPath !== agentPath && path.isAbsolute(agentPath) && fs.existsSync(agentPath)) {
          // 使用原始路径
          const command = agentPath.includes(' ') ? `"${agentPath}" --version` : `${agentPath} --version`;
          const execOptions: any = {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
            encoding: 'utf8', // 明确指定 UTF-8 编码
            env: { ...process.env, PATH: process.env.PATH }
          };
          const { stdout, stderr } = await execAsync(command, execOptions);
          const version = decodeOutput(stdout || stderr).trim();
          if (version) {
            if (outputChannel) {
              outputChannel.appendLine(`[Agent CLI] ✅ 通过原始路径找到 agent: ${agentPath}`);
              outputChannel.appendLine(`[Agent CLI] ✅ Agent CLI 可用，版本: ${version}`);
            }
            return {
              available: true,
              resolvedPath: agentPath,
              version: version || '未知版本'
            };
          }
        }
        continue; // 文件不存在，跳过
      }
      
      // 使用展开后的路径（如果展开成功）或原始路径
      const finalPath = (expandedPath !== agentPath && expandedPath && !expandedPath.includes('%') && !expandedPath.includes('$')) 
        ? expandedPath 
        : agentPath;
      
      // 再次检查最终路径（如果使用了展开后的路径）
      if (finalPath !== agentPath && path.isAbsolute(finalPath) && !fs.existsSync(finalPath)) {
        continue; // 展开后的路径也不存在，跳过
      }
      
      // 文件存在（或相对路径），尝试执行
      const command = finalPath.includes(' ') ? `"${finalPath}" --version` : `${finalPath} --version`;
      
      // 对于绝对路径，直接执行（不需要 shell）
      // 对于相对路径，使用 PowerShell（Windows）或 sh（Unix）
      const execOptions: any = {
        timeout: 5000,
        maxBuffer: 1024 * 1024, // 1MB
        encoding: 'utf8', // 明确指定 UTF-8 编码
        env: { ...process.env, PATH: process.env.PATH }
      };
      
      const isFinalAbsolute = path.isAbsolute(finalPath);
      if (!isFinalAbsolute && isWindows) {
        // 相对路径在 Windows 上使用 PowerShell
        execOptions.shell = 'powershell.exe';
        // 如果是 PowerShell，设置输出编码
        if (command.includes('agent')) {
          // 在 PowerShell 命令前添加编码设置
          const encodedCommand = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`;
          const { stdout, stderr } = await execAsync(encodedCommand, execOptions);
          const version = decodeOutput(stdout || stderr).trim();
          
          if (version) {
            if (outputChannel) {
              if (finalPath !== agentPath) {
                outputChannel.appendLine(`[Agent CLI] ✅ 通过展开路径找到 agent: ${agentPath} -> ${finalPath}`);
              } else {
                outputChannel.appendLine(`[Agent CLI] ✅ 通过直接路径找到 agent: ${agentPath}`);
              }
              outputChannel.appendLine(`[Agent CLI] ✅ Agent CLI 可用，版本: ${version}`);
            }
            return {
              available: true,
              resolvedPath: finalPath,
              version: version || '未知版本'
            };
          }
          continue; // 继续下一个路径
        }
      } else if (!isFinalAbsolute) {
        // 相对路径在 Unix 上使用 sh
        execOptions.shell = '/bin/sh';
      }
      // 绝对路径不需要 shell
      
      const { stdout, stderr } = await execAsync(command, execOptions);
      
        const version = decodeOutput(stdout || stderr).trim();
        
        if (version) {
          if (outputChannel) {
            if (finalPath !== agentPath) {
              outputChannel.appendLine(`[Agent CLI] ✅ 通过展开路径找到 agent: ${agentPath} -> ${finalPath}`);
            } else {
              outputChannel.appendLine(`[Agent CLI] ✅ 通过直接路径找到 agent: ${agentPath}`);
            }
            outputChannel.appendLine(`[Agent CLI] ✅ Agent CLI 可用，版本: ${version}`);
          }
          return {
            available: true,
            resolvedPath: finalPath,
            version: version || '未知版本'
          };
        }
    } catch (error) {
      // 文件不存在或执行失败，继续尝试下一个路径
      if (!lastError) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      continue;
    }
  }

  // 所有路径都失败
  // 解码错误消息，避免乱码
  let errorMessage = '未找到 agent 命令';
  if (lastError) {
    if (lastError instanceof Error) {
      errorMessage = decodeOutput(Buffer.from(lastError.message, 'utf8'));
      if (!errorMessage) {
        errorMessage = lastError.message; // 如果解码失败，使用原始消息
      }
    } else {
      errorMessage = decodeOutput(String(lastError));
    }
  }
  let errorDetails = '';

  // 分析错误类型
  if (errorMessage.includes('ENOENT') || errorMessage.includes('not found') || errorMessage.includes('无法找到') || errorMessage.includes('不是内部或外部命令')) {
    // 提供更详细的帮助信息
    const triedPaths = getPossibleAgentPaths().slice(0, 5); // 只显示前5个路径
    errorDetails = `Cursor Agent CLI 未安装或不在 PATH 中。\n` +
      `已尝试的路径：${triedPaths.join(', ')}\n` +
      `请确保已安装 Agent CLI 并添加到 PATH，或重新加载窗口。\n` +
      `如果已在 PowerShell 中成功运行 agent --version，请检查：\n` +
      `1. Agent CLI 是否在 PowerShell Profile 的 PATH 中（扩展无法访问）\n` +
      `2. 是否需要在系统环境变量中添加 Agent CLI 路径\n` +
      `3. 重新启动 Cursor 以使环境变量生效`;
  } else if (errorMessage.includes('timeout')) {
    errorDetails = '检测超时，CLI 可能响应缓慢';
  } else if (errorMessage.includes('EACCES') || errorMessage.includes('权限')) {
    errorDetails = '权限不足，无法执行 agent 命令';
  } else {
    errorDetails = `未知错误: ${errorMessage}`;
  }

  if (outputChannel) {
    outputChannel.appendLine(`[Agent CLI] ❌ 所有检测方法都失败`);
    outputChannel.appendLine(`[Agent CLI] 错误: ${errorMessage}`);
    outputChannel.appendLine(`[Agent CLI] 详情: ${errorDetails}`);
  }
  
  return {
    available: false,
    error: errorMessage,
    errorDetails
  };
}

/**
 * 执行 Agent Chat 命令的结果
 */
export interface AgentChatResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

/**
 * 执行 agent chat 命令
 * @param prompt 要发送给 Agent 的 prompt
 * @param workspaceRoot 工作区根目录
 * @param timeout 超时时间（毫秒），默认 5 分钟
 * @param agentPath 可选的 agent 可执行文件完整路径（避免依赖 PATH）
 * @returns 执行结果
 */
export async function executeAgentChat(
  prompt: string,
  workspaceRoot: string,
  timeout: number = 5 * 60 * 1000,
  agentPath?: string
): Promise<AgentChatResult> {
  try {
    const agentExec = getAgentExecutable(agentPath);
    // 根据操作系统选择合适的转义方式和 shell
    const isWindows = process.platform === 'win32';
    let command: string;
    let shell: string | undefined;
    let shellArgs: string[] | undefined;
    
    // 获取完整的 PATH 环境变量
    const fullPath = isWindows 
      ? `${process.env.PATH};${process.env.USERPROFILE}\\.local\\bin;${process.env.LOCALAPPDATA}\\Programs\\cursor\\resources\\app\\bin`
      : `${process.env.PATH}:${process.env.HOME}/.local/bin:${process.env.HOME}/.cargo/bin`;
    
    if (isWindows) {
      // Windows: 使用 PowerShell 执行，这样可以访问 PowerShell 的 PATH 环境变量
      // 注意：不使用 -NoProfile，这样可以加载用户的 PowerShell Profile
      // 转义 prompt 中的特殊字符（PowerShell 风格）
      const escaped = prompt.replace(/'/g, "''").replace(/"/g, '`"').replace(/\$/g, '`$');
      shell = 'powershell.exe';
      shellArgs = ['-NonInteractive', '-Command'];
      command = `${agentExec} chat "${escaped}"`;
    } else {
      // Unix/Linux: 使用 sh
      const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
      shell = '/bin/sh';
      shellArgs = ['-c'];
      command = `${agentExec} chat "${escaped}"`;
    }
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: workspaceRoot,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      encoding: 'utf8', // 明确指定 UTF-8 编码
      shell: shell,
      env: { ...process.env, PATH: fullPath }
    });
    
    return {
      success: true,
      output: decodeOutput(stdout || stderr),
      exitCode: 0
    };
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? decodeOutput(Buffer.from(error.message, 'utf8')) || error.message
      : decodeOutput(String(error));
    const exitCode = (error as any)?.code;
    
    return {
      success: false,
      error: errorMessage,
      exitCode
    };
  }
}

/**
 * 创建 Skill 的结果
 */
export interface CreateSkillResult {
  success: boolean;
  filePath?: string;
  created: boolean;
  verified: boolean;
  error?: string;
  usedAgentCli: boolean;
}

/**
 * 通过 Agent CLI 创建指定 skill
 * @param skillName skill 名称（如 'skills-admin'）
 * @param workspaceRoot 工作区根目录
 * @param skillPrompt 用于引导 Agent 创建 skill 的 prompt
 * @param targetPath 目标文件路径（相对于工作区根目录）
 * @param outputChannel 可选的输出通道，用于记录日志
 * @returns 创建结果
 */
export async function createSkillViaAgent(
  skillName: string,
  workspaceRoot: string,
  skillPrompt: string,
  targetPath: string,
  outputChannel?: vscode.OutputChannel
): Promise<CreateSkillResult> {
  const fullTargetPath = path.join(workspaceRoot, targetPath);
  
  // 检查 Agent CLI 是否可用
  const cliCheck = await checkAgentCliAvailable(outputChannel);
  if (!cliCheck.available) {
    if (outputChannel) {
      outputChannel.appendLine(`[Agent CLI] 不可用: ${cliCheck.errorDetails || cliCheck.error || '未知错误'}`);
      outputChannel.appendLine(`[Agent CLI] 将使用直接创建方式`);
    }
    return {
      success: false,
      created: false,
      verified: false,
      error: `Agent CLI 不可用: ${cliCheck.errorDetails || cliCheck.error}`,
      usedAgentCli: false
    };
  }
  
  if (outputChannel) {
    outputChannel.appendLine(`[Agent CLI] 开始通过 Agent 创建 ${skillName}...`);
    outputChannel.appendLine(`[Agent CLI] 目标路径: ${targetPath}`);
  }
  
  // 构建完整的 prompt
  const fullPrompt = `${skillPrompt}\n\n请确保文件路径为: ${targetPath}`;
  
  // 执行 agent chat 命令（传入解析路径，避免依赖 PATH）
  const chatResult = await executeAgentChat(fullPrompt, workspaceRoot, 10 * 60 * 1000, cliCheck.resolvedPath); // 10 分钟超时
  
  if (!chatResult.success) {
    if (outputChannel) {
      outputChannel.appendLine(`[Agent CLI] Agent 执行失败: ${chatResult.error}`);
      outputChannel.appendLine(`[Agent CLI] 将使用直接创建方式`);
    }
    return {
      success: false,
      created: false,
      verified: false,
      error: `Agent 执行失败: ${chatResult.error}`,
      usedAgentCli: true
    };
  }
  
  // 检查文件是否被创建
  const fileExists = fs.existsSync(fullTargetPath);
  if (!fileExists) {
    if (outputChannel) {
      outputChannel.appendLine(`[Agent CLI] ⚠️ Agent 执行完成，但文件未创建: ${targetPath}`);
      outputChannel.appendLine(`[Agent CLI] Agent 输出: ${chatResult.output?.substring(0, 500)}`);
    }
    return {
      success: false,
      created: false,
      verified: false,
      error: 'Agent 执行完成，但目标文件未创建',
      usedAgentCli: true
    };
  }
  
  // 验证文件内容
  let verified = false;
  try {
    const content = fs.readFileSync(fullTargetPath, 'utf-8');
    verified = content.length > 0 && content.includes(skillName);
  } catch (verifyError) {
    if (outputChannel) {
      outputChannel.appendLine(`[Agent CLI] ⚠️ 文件验证失败: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
    }
  }
  
  if (outputChannel) {
    if (verified) {
      outputChannel.appendLine(`[Agent CLI] ✅ 成功通过 Agent 创建 ${skillName}`);
      outputChannel.appendLine(`[Agent CLI] 文件路径: ${fullTargetPath}`);
    } else {
      outputChannel.appendLine(`[Agent CLI] ⚠️ 文件已创建但验证失败`);
    }
  }
  
  return {
    success: verified,
    filePath: fullTargetPath,
    created: fileExists,
    verified,
    usedAgentCli: true
  };
}

/**
 * 在终端中执行 agent chat 命令（用于用户可见的执行）
 * @param prompt 要发送给 Agent 的 prompt
 * @param workspaceRoot 工作区根目录
 * @param terminalName 终端名称
 * @param agentPath 可选的 agent 可执行文件完整路径（避免依赖 PATH）
 * @param extraEnv 可选的额外环境变量（新建终端时生效，如 OPENSKILLS_API_URL 供 skills-admin 使用）
 * @param forceAllowCommands 是否在启动时加 -f/--force（Cursor CLI：Force allow commands unless explicitly denied），默认 true，skills-admin 无需逐条确认
 * @returns 创建的终端实例
 */
/**
 * 在终端中执行 agent 命令（用于用户可见的执行）。
 * 若已存在同名终端（如「OpenSkills Wake」）则复用，不新建，保持项目整洁。
 * 当 forceAllowCommands 为 true 时使用 Cursor CLI 的 -f/--force，启动即「run-everything」无需手动确认。
 * @param usePrintMode 为 true 时使用 agent -p -f（非交互模式），直接执行、不打开聊天 UI，可避免「只输入不提交」；为 false 时使用 agent chat。
 */
export function executeAgentChatInTerminal(
  prompt: string,
  workspaceRoot: string,
  terminalName: string = 'OpenSkills Agent',
  agentPath?: string,
  extraEnv?: Record<string, string>,
  forceAllowCommands: boolean = true,
  usePrintMode: boolean = false
): vscode.Terminal {
  // 去除首尾空白与换行，避免「只输入不提交」：尾部换行可能导致命令被当作未完成输入
  const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  const isWindows = process.platform === 'win32';
  const agentExec = getAgentExecutable(agentPath);
  const forceFlag = forceAllowCommands ? ' -f' : '';
  let command: string;

  if (usePrintMode) {
    // agent -p -f --output-format stream-json "prompt"：非交互模式，stream-json 使终端实时输出进度（tool_call、assistant 等），避免「挂着无输出」
    if (isWindows) {
      const escaped = trimmedPrompt.replace(/'/g, "''").replace(/"/g, '`"');
      command = `${agentExec} -p${forceFlag} --output-format stream-json "${escaped}"`;
    } else {
      const escaped = trimmedPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      command = `${agentExec} -p${forceFlag} --output-format stream-json "${escaped}"`;
    }
  } else {
    // agent -f chat "prompt"：交互模式，打开聊天 UI（可能需手动按 Enter 提交）
    if (isWindows) {
      const escaped = trimmedPrompt.replace(/'/g, "''").replace(/"/g, '`"');
      command = `${agentExec}${forceFlag} chat "${escaped}"`;
    } else {
      const escaped = trimmedPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      command = `${agentExec}${forceFlag} chat "${escaped}"`;
    }
  }

  const ripgrepDir = getRipgrepToolsDir();
  let env: NodeJS.ProcessEnv = { ...process.env };
  if (fs.existsSync(ripgrepDir)) {
    env.PATH = ripgrepDir + path.delimiter + (process.env.PATH || '');
  }
  if (extraEnv && Object.keys(extraEnv).length > 0) {
    env = { ...env, ...extraEnv };
  }
  // 优先复用同名终端（名称完全一致或包含 terminalName，避免 VS Code 显示为 "OpenSkills Wake (1)" 时漏匹配）
  const existing = vscode.window.terminals.find(
    t => t.name === terminalName || (t.name && t.name.includes(terminalName))
  );
  const terminal = existing ?? vscode.window.createTerminal({
    name: terminalName,
    cwd: workspaceRoot,
    env
  });

  // 先显示终端，延迟后再发送，避免定时唤醒时终端未就绪导致「只输入不提交」
  terminal.show();

  // 不依赖 sendText(_, true)：在 Windows/定时唤醒时该参数可能不触发执行。改为手动在命令末尾加换行再发送。
  const eol = isWindows ? '\r\n' : '\n';
  const commandToSend = command + eol;

  // 复用已有终端时给更长延迟，确保终端就绪后再发送（否则易出现「只输入不提交」）
  const delayMs = existing ? 400 : 220;
  setTimeout(() => {
    try {
      terminal.sendText(commandToSend, false);
    } catch (e) {
      const out = getOutputChannel();
      if (out) {
        out.appendLine(`[Agent CLI] sendText 失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }, delayMs);

  return terminal;
}

const AGENT_START_COOLDOWN_MS = 60 * 1000; // 60 秒内不重复启动，避免 autoStart + 定时器 双触发
let lastAgentBackgroundStartTime = 0;

/** Background skills-admin agent process; killed on extension deactivate so disable/uninstall can complete. */
let backgroundAgentProcess: ReturnType<typeof spawn> | null = null;

const AGENT_KILL_WAIT_MS = 4000;

/** Destroy child stdio streams so extension host releases pipe FDs (avoids directory lock on uninstall). */
function destroyChildStdio(proc: ReturnType<typeof spawn>): void {
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
 * Kill the background skills-admin agent process (if any). Sync version; does not wait for exit.
 * Prefer killBackgroundAgentProcessAsync in deactivate so processes fully exit before folder removal.
 */
export function killBackgroundAgentProcess(): void {
  const proc = backgroundAgentProcess;
  backgroundAgentProcess = null;
  if (!proc || !proc.pid) {
    try {
      if (proc) {
        destroyChildStdio(proc);
        proc.kill('SIGKILL');
      }
    } catch {
      // ignore
    }
    return;
  }
  destroyChildStdio(proc);
  try {
    proc.kill('SIGKILL');
  } catch {
    // ignore
  }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: true,
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Kill the background agent process and wait for it (and its tree on Windows) to exit.
 * Required so that on disable/uninstall no process keeps the extension directory locked.
 */
export function killBackgroundAgentProcessAsync(): Promise<void> {
  const proc = backgroundAgentProcess;
  backgroundAgentProcess = null;
  if (!proc || !proc.pid) {
    try {
      if (proc) {
        destroyChildStdio(proc);
        proc.kill('SIGKILL');
      }
    } catch {
      // ignore
    }
    return Promise.resolve();
  }
  const pid = proc.pid;
  destroyChildStdio(proc);
  try {
    proc.kill('SIGKILL');
  } catch {
    // ignore
  }
  return new Promise<void>(resolve => {
    const timeout = setTimeout(resolve, AGENT_KILL_WAIT_MS);
    const onExit = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    proc.once('exit', onExit);
    proc.once('error', onExit);
    if (process.platform === 'win32') {
      const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: true,
      });
      tk.once('exit', onExit);
      tk.once('error', onExit);
    } else {
      setTimeout(onExit, 800);
    }
  });
}

/**
 * 在后台执行 agent -p，输出到 OpenSkillsAdmin 通道（单例）。
 * 不阻塞，不占用终端。超时后自动 kill 进程，回收资源。
 * @param timeoutMs 超时毫秒数，超期则 kill；0 表示不设超时
 * @param outputFormat 'text' 仅输出最终结果（简洁），'stream-json' 输出完整 NDJSON（冗长）
 */
export function executeAgentInBackground(
  prompt: string,
  workspaceRoot: string,
  agentPath?: string,
  extraEnv?: Record<string, string>,
  forceAllowCommands: boolean = true,
  timeoutMs: number = 45 * 60 * 1000,
  outputFormat: 'text' | 'stream-json' = 'text'
): void {
  const now = Date.now();
  if (now - lastAgentBackgroundStartTime < AGENT_START_COOLDOWN_MS) {
    const channel = getOpenSkillsAdminChannel();
    channel.appendLine(`[跳过] 距上次启动不足 ${AGENT_START_COOLDOWN_MS / 1000} 秒，避免重复执行`);
    channel.show();
    return;
  }
  lastAgentBackgroundStartTime = now;

  const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  const agentExe = resolveAgentPathSync(agentPath);
  const forceArg = forceAllowCommands ? '-f' : '';
  const formatArg = outputFormat === 'stream-json' ? 'stream-json' : 'text';
  const args = ['-p', '--output-format', formatArg, trimmedPrompt];
  if (forceArg) args.splice(1, 0, forceArg);

  const ripgrepDir = getRipgrepToolsDir();
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathParts: string[] = [];
  if (fs.existsSync(ripgrepDir)) pathParts.push(ripgrepDir);
  // agent 常见安装目录加入 PATH，避免 spawn ENOENT（Extension Development Host 等场景 PATH 可能不含 agent）
  if (process.platform === 'win32') {
    const base = process.env.USERPROFILE || process.env.LOCALAPPDATA || '';
    if (base) {
      pathParts.push(path.join(base, '.local', 'bin'));
      pathParts.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cursor', 'resources', 'app', 'bin'));
    }
  } else {
    const home = process.env.HOME || '';
    if (home) {
      pathParts.push(path.join(home, '.local', 'bin'));
      pathParts.push(path.join(home, '.cargo', 'bin'));
    }
  }
  if (pathParts.length) {
    const existing = pathParts.filter((p) => p && fs.existsSync(p));
    if (existing.length) {
      env.PATH = existing.join(path.delimiter) + path.delimiter + (process.env.PATH || '');
    }
  }
  if (extraEnv && Object.keys(extraEnv).length > 0) {
    Object.assign(env, extraEnv);
  }

  const channel = getOpenSkillsAdminChannel();
  const sep = '─'.repeat(60);
  channel.appendLine(`${sep}\n[${new Date().toISOString()}] 后台启动 skills-admin Agent（超时 ${timeoutMs ? Math.round(timeoutMs / 60000) : '无'} 分钟，输出: ${outputFormat}）`);
  if (agentExe !== 'agent') {
    channel.appendLine(`[Agent 路径] ${agentExe}`);
  }
  channel.appendLine(sep);

  const isWindows = process.platform === 'win32';
  const useShell = isWindows && agentExe === 'agent'; // 仅当未解析到路径时用 shell
  const child = spawn(agentExe, args, {
    cwd: workspaceRoot,
    env,
    shell: useShell,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  backgroundAgentProcess = child;

  let exited = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const killProcess = (reason: string) => {
    if (exited) return;
    exited = true;
    if (backgroundAgentProcess === child) backgroundAgentProcess = null;
    cleanup();
    try {
      destroyChildStdio(child);
      child.kill('SIGKILL');
      channel.appendLine(`\n[超时终止] ${reason}，已 kill 进程\n`);
    } catch (e) {
      channel.appendLine(`\n[超时终止] ${reason}，kill 失败: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  };

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      killProcess(`超过 ${Math.round(timeoutMs / 60000)} 分钟未结束`);
    }, timeoutMs);
  }

  const append = (data: Buffer | string) => {
    const s = typeof data === 'string' ? data : data.toString('utf8');
    if (s) channel.append(s);
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  child.on('close', (code, signal) => {
    if (backgroundAgentProcess === child) backgroundAgentProcess = null;
    if (!exited) {
      exited = true;
      cleanup();
    }
    channel.appendLine(`\n${sep}\n[进程退出] code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
  });
  child.on('error', (err) => {
    if (backgroundAgentProcess === child) backgroundAgentProcess = null;
    if (!exited) {
      exited = true;
      cleanup();
    }
    channel.appendLine(`\n[错误] ${err.message}`);
    if (err.message.includes('ENOENT')) {
      channel.appendLine('[提示] 未找到 agent 可执行文件。请在设置中配置 openskills.agentCliPath 为 agent 的完整路径。');
    }
  });

  channel.show();
}
