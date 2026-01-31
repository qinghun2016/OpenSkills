/**
 * File utilities for OpenSkills API
 * Handles all file system operations for proposals, decisions, and history
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DIR_OPENSKILLS,
  DIR_CURSOR,
  SUBDIR_PROPOSALS,
  SUBDIR_DECISIONS,
  SUBDIR_HISTORY,
  SUBDIR_SCHEMAS,
  SUBDIR_CRAWLED,
  SUBDIR_RUNS,
  SUBDIR_SKILLS,
  SUBDIR_BACKUPS,
  SUBDIR_WAKE,
  SUBDIR_ARCHIVED,
  SUBDIR_ACTIVE,
  SUBDIR_OLD,
  SUBDIR_REWARDS,
  SUBDIR_MERGE,
  CONFIG_FILE as CONFIG_FILENAME,
  SKILL_ENTRY_FILE,
} from '../constants/paths';
import { sanitizeSkillName, isPathWithinWorkspace } from './pathValidation';

// Base paths (relative to workspace)
const PROPOSALS_DIR = path.join(DIR_OPENSKILLS, SUBDIR_PROPOSALS);
const DECISIONS_DIR = path.join(DIR_OPENSKILLS, SUBDIR_DECISIONS);
const HISTORY_DIR = path.join(DIR_OPENSKILLS, SUBDIR_HISTORY);
const SCHEMAS_DIR = path.join(DIR_OPENSKILLS, SUBDIR_SCHEMAS);
const CONFIG_FILE = path.join(DIR_OPENSKILLS, CONFIG_FILENAME);
const CRAWLED_DIR = path.join(DIR_OPENSKILLS, SUBDIR_CRAWLED);
const CRAWLER_RUNS_DIR = path.join(CRAWLED_DIR, SUBDIR_RUNS);

// Skills paths (user dir resolved on demand to avoid module-load binding)
const PROJECT_SKILLS_DIR = path.join(DIR_CURSOR, SUBDIR_SKILLS);

function getUserSkillsDir(): string {
  return path.join(process.env.HOME || process.env.USERPROFILE || '', DIR_CURSOR, SUBDIR_SKILLS);
}

/**
 * Get the base directory (workspace root)
 * Prefer WORKSPACE_ROOT, then OPENSKILLS_WORKSPACE, then cwd-based inference.
 */
export function getBaseDir(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }
  if (process.env.OPENSKILLS_WORKSPACE) {
    return path.resolve(process.cwd(), process.env.OPENSKILLS_WORKSPACE);
  }
  const cwd = process.cwd();
  if (cwd.includes('packages')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

/**
 * Resolve a path relative to workspace root
 */
export function resolvePath(...segments: string[]): string {
  return path.join(getBaseDir(), ...segments);
}

/**
 * Ensure a directory exists, create if not
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a JSON file
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Write a JSON file
 */
export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Read a text file
 */
export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Write a text file
 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

/**
 * List all JSON files in a directory
 */
export async function listJsonFiles(dirPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dirPath);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(dirPath, f));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Get proposals directory path
 */
export function getProposalsDir(): string {
  return resolvePath(PROPOSALS_DIR);
}

/**
 * Get decisions directory path
 */
export function getDecisionsDir(): string {
  return resolvePath(DECISIONS_DIR);
}

/**
 * Get history directory path
 */
export function getHistoryDir(): string {
  return resolvePath(HISTORY_DIR);
}

/**
 * Get schemas directory path
 */
export function getSchemasDir(): string {
  return resolvePath(SCHEMAS_DIR);
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return resolvePath(CONFIG_FILE);
}

/**
 * Get proposal file path by id
 */
export function getProposalPath(id: string): string {
  return path.join(getProposalsDir(), `${id}.json`);
}

/**
 * Get decision file path by proposal id
 */
export function getDecisionPath(proposalId: string): string {
  return path.join(getDecisionsDir(), `${proposalId}.json`);
}

/**
 * Get history entry file path by id
 */
export function getHistoryPath(id: string): string {
  return path.join(getHistoryDir(), `${id}.json`);
}

/**
 * Get history backups directory path (files: {id}.backup)
 */
export function getHistoryBackupsDir(): string {
  return path.join(getHistoryDir(), SUBDIR_BACKUPS);
}

/**
 * Get history backup file path
 */
export function getHistoryBackupPath(id: string): string {
  return path.join(getHistoryBackupsDir(), `${id}.backup`);
}

/**
 * Get skill path based on scope
 * Validates skillName (no path traversal) and ensures result is within workspace/user skills dir
 */
export function getSkillPath(skillName: string, scope: 'user' | 'project'): string {
  const safe = sanitizeSkillName(skillName);
  if (safe === null) {
    throw new Error('Invalid skill name');
  }
  const baseDir = scope === 'user' ? getUserSkillsDir() : resolvePath(PROJECT_SKILLS_DIR);
  const fullPath = path.join(baseDir, safe, SKILL_ENTRY_FILE);
  const resolved = path.resolve(fullPath);
  const rootForCheck = scope === 'user' ? path.resolve(getUserSkillsDir()) : getBaseDir();
  if (!isPathWithinWorkspace(resolved, rootForCheck)) {
    throw new Error('Path outside workspace');
  }
  return fullPath;
}

/**
 * Get skill directory path based on scope
 */
export function getSkillDir(skillName: string, scope: 'user' | 'project'): string {
  const safe = sanitizeSkillName(skillName);
  if (safe === null) {
    throw new Error('Invalid skill name');
  }
  const baseDir = scope === 'user' ? getUserSkillsDir() : resolvePath(PROJECT_SKILLS_DIR);
  const fullPath = path.join(baseDir, safe);
  const resolved = path.resolve(fullPath);
  const rootForCheck = scope === 'user' ? path.resolve(getUserSkillsDir()) : getBaseDir();
  if (!isPathWithinWorkspace(resolved, rootForCheck)) {
    throw new Error('Path outside workspace');
  }
  return fullPath;
}

/**
 * Initialize all required directories
 */
export async function initDirectories(): Promise<void> {
  // Base directories
  await ensureDir(getProposalsDir());
  await ensureDir(getDecisionsDir());
  await ensureDir(getHistoryDir());
  
  // History backups (existing)
  await ensureDir(path.join(getHistoryDir(), SUBDIR_BACKUPS));
  
  // Merge-related directories
  // Proposals: active, archived, old
  await ensureDir(getActiveDir('proposals'));
  await ensureDir(getArchivedDir('proposals'));
  await ensureDir(getOldFilesDir('proposals'));
  
  // Decisions: active, archived, old
  await ensureDir(getActiveDir('decisions'));
  await ensureDir(getArchivedDir('decisions'));
  await ensureDir(getOldFilesDir('decisions'));
  
  // History: active, archived, old
  await ensureDir(getActiveDir('history'));
  await ensureDir(getArchivedDir('history'));
  await ensureDir(getOldFilesDir('history'));
  
  // Crawler runs directories
  await ensureDir(getCrawlerRunsDir());
  await ensureDir(getArchivedCrawlerRunsDir());
  
  // Wake history directories
  await ensureDir(getWakeHistoryDir());
  await ensureDir(getArchivedWakeHistoryDir());

  // Rewards history (and archived)
  await ensureDir(getRewardsHistoryDir());
  await ensureDir(getArchivedRewardsHistoryDir());

  // Merge run history
  await ensureDir(getMergeHistoryDir());

  // Lock files directory
  await ensureDir(resolvePath(DIR_OPENSKILLS, '.locks'));
  
  // Merge temporary directory
  await ensureDir(getMergeTempDir());
}

/**
 * Copy a file
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  const dir = path.dirname(dest);
  await ensureDir(dir);
  await fs.copyFile(src, dest);
}

/**
 * Get file stats
 */
export async function getFileStats(filePath: string): Promise<fs.FileHandle | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats as unknown as fs.FileHandle;
  } catch {
    return null;
  }
}

/**
 * Get merge temporary directory path
 */
export function getMergeTempDir(): string {
  return resolvePath(DIR_OPENSKILLS, '.merge-temp');
}

/**
 * Get archived directory path for a type (proposals/decisions/history)
 */
export function getArchivedDir(type: 'proposals' | 'decisions' | 'history'): string {
  const baseDir = type === 'proposals' 
    ? getProposalsDir() 
    : type === 'decisions' 
    ? getDecisionsDir() 
    : getHistoryDir();
  return path.join(baseDir, SUBDIR_ARCHIVED);
}

/**
 * Get active directory path for a type (proposals/decisions/history)
 */
export function getActiveDir(type: 'proposals' | 'decisions' | 'history'): string {
  const baseDir = type === 'proposals' 
    ? getProposalsDir() 
    : type === 'decisions' 
    ? getDecisionsDir() 
    : getHistoryDir();
  return path.join(baseDir, SUBDIR_ACTIVE);
}

/**
 * Get old files directory path for a type
 */
export function getOldFilesDir(type: 'proposals' | 'decisions' | 'history'): string {
  const baseDir = type === 'proposals' 
    ? getProposalsDir() 
    : type === 'decisions' 
    ? getDecisionsDir() 
    : getHistoryDir();
  return path.join(baseDir, SUBDIR_OLD);
}

/**
 * Get crawler runs directory path
 */
export function getCrawlerRunsDir(): string {
  return resolvePath(CRAWLER_RUNS_DIR);
}

/**
 * Get archived crawler runs directory path
 */
export function getArchivedCrawlerRunsDir(): string {
  return path.join(getCrawlerRunsDir(), SUBDIR_ARCHIVED);
}

/**
 * Get wake history directory path
 */
export function getWakeHistoryDir(): string {
  return resolvePath(DIR_OPENSKILLS, SUBDIR_WAKE, SUBDIR_HISTORY);
}

/**
 * Get archived wake history directory path
 */
export function getArchivedWakeHistoryDir(): string {
  return path.join(getWakeHistoryDir(), SUBDIR_ARCHIVED);
}

/**
 * Get rewards directory path
 */
export function getRewardsDir(): string {
  return resolvePath(DIR_OPENSKILLS, SUBDIR_REWARDS);
}

/**
 * Get rewards history directory path (files: {timestamp}-{proposalId}.json)
 */
export function getRewardsHistoryDir(): string {
  return path.join(getRewardsDir(), SUBDIR_HISTORY);
}

/**
 * Get archived rewards history directory path
 */
export function getArchivedRewardsHistoryDir(): string {
  return path.join(getRewardsHistoryDir(), SUBDIR_ARCHIVED);
}

/**
 * Get merge run history directory path (files: {timestamp}.json)
 */
export function getMergeHistoryDir(): string {
  return resolvePath(DIR_OPENSKILLS, SUBDIR_MERGE, SUBDIR_HISTORY);
}

/**
 * Atomically move a file or directory
 * Uses fs.rename which is atomic on most filesystems
 */
export async function atomicMove(src: string, dest: string): Promise<void> {
  const destDir = path.dirname(dest);
  await ensureDir(destDir);
  await fs.rename(src, dest);
}

/**
 * List all files (not just JSON) in a directory
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dirPath);
    return files.map(f => path.join(dirPath, f));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}
