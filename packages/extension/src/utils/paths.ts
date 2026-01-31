/**
 * OpenSkills 路径工具
 * 处理用户级和项目级路径
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * 获取用户级 .cursor 目录路径
 */
export function getUserCursorDir(): string {
  return path.join(os.homedir(), '.cursor');
}

/**
 * 获取用户级 skills 目录路径
 */
export function getUserSkillsDir(): string {
  return path.join(getUserCursorDir(), 'skills');
}

/**
 * 获取项目级 .cursor 目录路径
 */
export function getProjectCursorDir(): string | undefined {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return undefined;
  }
  return path.join(workspaceRoot, '.cursor');
}

/**
 * 获取项目级 skills 目录路径
 */
export function getProjectSkillsDir(): string | undefined {
  const projectCursorDir = getProjectCursorDir();
  if (!projectCursorDir) {
    return undefined;
  }
  return path.join(projectCursorDir, 'skills');
}

/**
 * 获取项目级 .openskills 目录路径
 */
export function getOpenSkillsDir(): string | undefined {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return undefined;
  }
  return path.join(workspaceRoot, '.openskills');
}

/**
 * 获取「当前打开的」第一个工作区文件夹路径。
 * Cursor 只扫描此路径下的 .cursor/skills/ 来显示 Agent，与 getWorkspaceRoot() 可能不同
 *（例如打开的是子文件夹时，getWorkspaceRoot 可能是包含 .openskills 的父目录）。
 */
export function getFirstWorkspaceFolder(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  return workspaceFolders[0].uri.fsPath;
}

/**
 * 获取工作区根目录
 * 如果当前工作区是子目录，向上查找包含 .openskills 的项目根目录
 */
export function getWorkspaceRoot(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  
  let currentPath = workspaceFolders[0].uri.fsPath;
  
  // 向上查找包含 .openskills 目录的根目录
  while (currentPath !== path.dirname(currentPath)) {
    const openSkillsDir = path.join(currentPath, '.openskills');
    if (fs.existsSync(openSkillsDir)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  
  // 如果找不到，返回当前工作区路径
  return workspaceFolders[0].uri.fsPath;
}

/**
 * 检查 .openskills 目录是否存在
 */
export function isOpenSkillsInitialized(): boolean {
  const openSkillsDir = getOpenSkillsDir();
  if (!openSkillsDir) {
    return false;
  }
  return fs.existsSync(openSkillsDir);
}

/**
 * 检查 skills-admin 是否存在
 */
export function skillsAdminExists(): boolean {
  const projectSkillsDir = getProjectSkillsDir();
  if (projectSkillsDir) {
    const projectPath = path.join(projectSkillsDir, 'skills-admin', 'SKILL.md');
    if (fs.existsSync(projectPath)) {
      return true;
    }
  }
  
  const userSkillsDir = getUserSkillsDir();
  const userPath = path.join(userSkillsDir, 'skills-admin', 'SKILL.md');
  return fs.existsSync(userPath);
}

/**
 * 获取 skills-admin SKILL.md 路径
 */
export function getSkillsAdminPath(): string | undefined {
  const projectSkillsDir = getProjectSkillsDir();
  if (projectSkillsDir) {
    const projectPath = path.join(projectSkillsDir, 'skills-admin', 'SKILL.md');
    if (fs.existsSync(projectPath)) {
      return projectPath;
    }
  }
  
  const userSkillsDir = getUserSkillsDir();
  const userPath = path.join(userSkillsDir, 'skills-admin', 'SKILL.md');
  if (fs.existsSync(userPath)) {
    return userPath;
  }
  
  return undefined;
}

/**
 * 获取 proposals 目录路径
 */
export function getProposalsDir(): string | undefined {
  const openSkillsDir = getOpenSkillsDir();
  if (!openSkillsDir) {
    return undefined;
  }
  return path.join(openSkillsDir, 'proposals');
}

/**
 * 获取 decisions 目录路径
 */
export function getDecisionsDir(): string | undefined {
  const openSkillsDir = getOpenSkillsDir();
  if (!openSkillsDir) {
    return undefined;
  }
  return path.join(openSkillsDir, 'decisions');
}

/**
 * 获取 config.json 路径
 */
export function getConfigPath(): string | undefined {
  const openSkillsDir = getOpenSkillsDir();
  if (!openSkillsDir) {
    return undefined;
  }
  return path.join(openSkillsDir, 'config.json');
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 读取 JSON 文件
 */
export function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

/**
 * 写入 JSON 文件
 */
export function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 列出目录中的 JSON 文件
 */
export function listJsonFiles(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    return fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(dirPath, file));
  } catch {
    return [];
  }
}

/**
 * 列出目录中的子目录
 */
export function listDirectories(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => path.join(dirPath, dirent.name));
  } catch {
    return [];
  }
}

/**
 * 读取文件内容
 */
export function readFile(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * 写入文件内容
 */
export function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 复制文件
 */
export function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * 复制目录
 */
export function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}
