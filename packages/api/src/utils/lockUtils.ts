/**
 * Lock utilities for OpenSkills API
 * Handles file locking mechanism to prevent conflicts between agent operations and merge tasks
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { resolvePath, ensureDir, readJsonFile, writeJsonFile, fileExists, deleteFile } from './fileUtils';

// Lock directory path
const LOCKS_DIR = path.join('.openskills', '.locks');

/**
 * Lock file structure
 */
interface LockInfo {
  operation: string;
  startedAt: string;
  pid: number;
  expiresAt: string;
}

/**
 * Get the locks directory path
 */
function getLocksDir(): string {
  return resolvePath(LOCKS_DIR);
}

/**
 * Get lock file path for an operation
 */
function getLockPath(operation: string): string {
  // Sanitize operation name for filename
  const sanitized = operation.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(getLocksDir(), `${sanitized}.lock`);
}

/**
 * Check if a process is still running
 * Uses signal 0 which works on both Unix and Windows
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Signal 0 doesn't actually send a signal, but checks if the process exists
    // This works on both Unix-like systems and Windows
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // Process doesn't exist or we don't have permission
    // On Windows, this will throw if the process doesn't exist
    return false;
  }
}

/**
 * Clean up expired locks
 */
async function cleanupExpiredLocks(): Promise<void> {
  try {
    const locksDir = getLocksDir();
    const files = await fs.readdir(locksDir);
    
    for (const file of files) {
      if (!file.endsWith('.lock')) {
        continue;
      }
      
      const lockPath = path.join(locksDir, file);
      const lockInfo = await readJsonFile<LockInfo>(lockPath);
      
      if (!lockInfo) {
        // Invalid lock file, remove it
        await deleteFile(lockPath);
        continue;
      }
      
      // Check if lock is expired
      const expiresAt = new Date(lockInfo.expiresAt);
      if (expiresAt < new Date()) {
        await deleteFile(lockPath);
        continue;
      }
      
      // Check if process is still running
      if (!isProcessRunning(lockInfo.pid)) {
        await deleteFile(lockPath);
        continue;
      }
    }
  } catch (err) {
    // If locks directory doesn't exist, that's fine
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Acquire a lock for an operation
 * @param operation Operation name (e.g., 'agent-review', 'merge-task')
 * @param timeout Optional timeout in seconds (default: 1800 = 30 minutes)
 * @returns true if lock was acquired, false if already locked
 */
export async function acquireLock(
  operation: string,
  timeout: number = 1800
): Promise<boolean> {
  // Clean up expired locks first
  await cleanupExpiredLocks();
  
  // Ensure locks directory exists
  await ensureDir(getLocksDir());
  
  const lockPath = getLockPath(operation);
  
  // Check if lock already exists
  const existingLock = await readJsonFile<LockInfo>(lockPath);
  if (existingLock) {
    // Check if lock is expired
    const expiresAt = new Date(existingLock.expiresAt);
    if (expiresAt < new Date()) {
      // Lock expired, remove it
      await deleteFile(lockPath);
    } else {
      // Check if process is still running
      if (isProcessRunning(existingLock.pid)) {
        // Lock is still valid
        return false;
      } else {
        // Process is dead, remove stale lock
        await deleteFile(lockPath);
      }
    }
  }
  
  // Create new lock
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeout * 1000);
  
  const lockInfo: LockInfo = {
    operation,
    startedAt: now.toISOString(),
    pid: process.pid,
    expiresAt: expiresAt.toISOString(),
  };
  
  await writeJsonFile(lockPath, lockInfo);
  return true;
}

/**
 * Release a lock for an operation
 * @param operation Operation name
 * @returns true if lock was released, false if lock didn't exist
 */
export async function releaseLock(operation: string): Promise<boolean> {
  const lockPath = getLockPath(operation);
  return await deleteFile(lockPath);
}

/**
 * Check if an operation is currently locked
 * @param operation Operation name
 * @returns true if locked, false if not locked
 */
export async function isLocked(operation: string): Promise<boolean> {
  // Clean up expired locks first
  await cleanupExpiredLocks();
  
  const lockPath = getLockPath(operation);
  const exists = await fileExists(lockPath);
  
  if (!exists) {
    return false;
  }
  
  const lockInfo = await readJsonFile<LockInfo>(lockPath);
  if (!lockInfo) {
    // Invalid lock file, consider it not locked
    return false;
  }
  
  // Check if lock is expired
  const expiresAt = new Date(lockInfo.expiresAt);
  if (expiresAt < new Date()) {
    // Lock expired, remove it
    await deleteFile(lockPath);
    return false;
  }
  
  // Check if process is still running
  if (!isProcessRunning(lockInfo.pid)) {
    // Process is dead, remove stale lock
    await deleteFile(lockPath);
    return false;
  }
  
  return true;
}

/**
 * Check if any agent operation is currently in progress
 * Common agent operation names to check
 * @returns true if any agent operation is locked, false otherwise
 */
export async function checkAgentOperation(): Promise<boolean> {
  // Common agent operation names
  const agentOperations = [
    'agent-review',
    'agent-operation',
    'proposal-create',
    'proposal-review',
    'decision-apply',
    'diff-apply',
  ];
  
  // Clean up expired locks first
  await cleanupExpiredLocks();
  
  // Check each agent operation
  for (const operation of agentOperations) {
    if (await isLocked(operation)) {
      return true;
    }
  }
  
  // Also check for any lock files that might indicate agent activity
  try {
    const locksDir = getLocksDir();
    const files = await fs.readdir(locksDir);
    const lockFiles = files.filter(f => f.endsWith('.lock'));
    
    if (lockFiles.length > 0) {
      // Check if any lock is still valid
      for (const file of lockFiles) {
        const lockPath = path.join(locksDir, file);
        const lockInfo = await readJsonFile<LockInfo>(lockPath);
        
        if (lockInfo) {
          const expiresAt = new Date(lockInfo.expiresAt);
          if (expiresAt >= new Date() && isProcessRunning(lockInfo.pid)) {
            return true;
          }
        }
      }
    }
  } catch (err) {
    // If locks directory doesn't exist, no locks
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
  
  return false;
}

/**
 * Get lock information for an operation
 * @param operation Operation name
 * @returns Lock information or null if not locked
 */
export async function getLockInfo(operation: string): Promise<LockInfo | null> {
  const lockPath = getLockPath(operation);
  return await readJsonFile<LockInfo>(lockPath);
}

/**
 * Initialize locks directory
 */
export async function initLocksDir(): Promise<void> {
  await ensureDir(getLocksDir());
}
