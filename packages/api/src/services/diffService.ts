/**
 * Diff Service
 * Handles applying and reverting unified diffs to skill files
 */

import * as Diff from 'diff';
import { v4 as uuidv4 } from 'uuid';
import {
  readTextFile,
  writeTextFile,
  fileExists,
  getHistoryBackupPath,
  copyFile,
  ensureDir,
  getHistoryDir,
  getBaseDir,
} from '../utils/fileUtils';
import { checkDiffSafety } from '../utils/diffSafety';
import { isPathWithinWorkspace } from '../utils/pathValidation';
import * as path from 'path';
import { acquireLock, releaseLock } from '../utils/lockUtils';
import {
  DiffApplyResult,
  DiffRevertResult,
  HistoryEntry,
  ProposalScope,
  DeciderType,
} from '../types';
import * as historyService from './historyService';

/**
 * Parse a unified diff string
 */
export function parseDiff(diffString: string): Diff.ParsedDiff[] {
  return Diff.parsePatch(diffString);
}

/**
 * Apply a unified diff to file content
 */
export function applyPatch(
  originalContent: string,
  diffString: string,
  options: { fuzz?: number } = {}
): string | false {
  const fuzz = options.fuzz ?? 2;
  const result = Diff.applyPatch(originalContent, diffString, { fuzzFactor: fuzz });
  return result;
}

/**
 * Reverse a diff (for rollback)
 */
export function reverseDiff(diffString: string): string {
  const patches = Diff.parsePatch(diffString);
  
  // Reverse each hunk
  const reversedPatches = patches.map(patch => {
    const reversedHunks = patch.hunks.map(hunk => ({
      ...hunk,
      oldStart: hunk.newStart,
      oldLines: hunk.newLines,
      newStart: hunk.oldStart,
      newLines: hunk.oldLines,
      lines: hunk.lines.map(line => {
        if (line.startsWith('+')) {
          return '-' + line.slice(1);
        } else if (line.startsWith('-')) {
          return '+' + line.slice(1);
        }
        return line;
      }),
    }));

    return {
      ...patch,
      oldFileName: patch.newFileName,
      newFileName: patch.oldFileName,
      oldHeader: patch.newHeader,
      newHeader: patch.oldHeader,
      hunks: reversedHunks,
    };
  });

  // Reconstruct the diff string
  let result = '';
  for (const patch of reversedPatches) {
    result += `--- ${patch.oldFileName || 'a/file'}\n`;
    result += `+++ ${patch.newFileName || 'b/file'}\n`;
    
    for (const hunk of patch.hunks) {
      result += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
      result += hunk.lines.join('\n') + '\n';
    }
  }

  return result;
}

/**
 * Create a unified diff from two strings
 */
export function createDiff(
  oldContent: string,
  newContent: string,
  options: { oldFileName?: string; newFileName?: string } = {}
): string {
  const oldName = options.oldFileName || 'a/file';
  const newName = options.newFileName || 'b/file';
  return Diff.createPatch(oldName, oldContent, newContent, '', '');
}

/**
 * Backup original file before applying diff
 */
async function backupFile(
  skillPath: string,
  historyId: string
): Promise<boolean> {
  try {
    const backupPath = getHistoryBackupPath(historyId);
    await copyFile(skillPath, backupPath);
    return true;
  } catch (err) {
    console.error('Failed to backup file:', err);
    return false;
  }
}

/**
 * Apply a diff to a skill file
 * Creates a backup in history before applying
 */
export async function applyDiff(
  skillPath: string,
  diffString: string,
  options: {
    proposalId: string;
    skillName: string;
    scope: ProposalScope;
    appliedBy: DeciderType;
  }
): Promise<DiffApplyResult> {
  const lockOperation = 'diff-apply';
  const lockAcquired = await acquireLock(lockOperation);

  if (!lockAcquired) {
    return {
      success: false,
      error: 'Another diff operation is in progress. Please try again later.',
    };
  }

  try {
    const safety = checkDiffSafety(diffString);
    if (!safety.safe) {
      return {
        success: false,
        error: safety.reason ?? 'Diff safety check failed',
      };
    }
    if (options.scope === 'project') {
      const resolvedPath = path.resolve(skillPath);
      const workspaceRoot = getBaseDir();
      if (!isPathWithinWorkspace(resolvedPath, workspaceRoot)) {
        return {
          success: false,
          error: 'Target path outside workspace',
        };
      }
    }
    // Check if file exists
    const exists = await fileExists(skillPath);
    let originalContent = '';

    if (exists) {
      const content = await readTextFile(skillPath);
      if (content === null) {
        return {
          success: false,
          error: 'Failed to read original file',
        };
      }
      originalContent = content;
    }

    // Generate history ID
    const historyId = uuidv4();

    // Backup original file if it exists
    if (exists) {
      const backed = await backupFile(skillPath, historyId);
      if (!backed) {
        return {
          success: false,
          error: 'Failed to create backup',
        };
      }
    }

    // Normalize line endings so patch matches regardless of CRLF vs LF
    const normalizedOriginal = originalContent.replace(/\r\n/g, '\n');
    const normalizedDiff = diffString.replace(/\r\n/g, '\n');

    // Apply the patch
    const newContent = applyPatch(normalizedOriginal, normalizedDiff);

    if (newContent === false) {
      return {
        success: false,
        error: 'Failed to apply diff - patch does not match file content',
      };
    }

    // Write the new content
    await writeTextFile(skillPath, newContent);

    // Create history entry
    const historyEntry: HistoryEntry = {
      id: historyId,
      proposalId: options.proposalId,
      skillName: options.skillName,
      skillPath,
      scope: options.scope,
      diff: diffString,
      originalContent,
      appliedAt: new Date().toISOString(),
      appliedBy: options.appliedBy,
    };

    await historyService.createHistoryEntry(historyEntry);

    return {
      success: true,
      newContent,
      historyId,
    };
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error: ${(err as Error).message}`,
    };
  } finally {
    await releaseLock(lockOperation);
  }
}

/**
 * Revert a diff (rollback to previous version)
 */
export async function revertDiff(
  skillPath: string,
  diffString: string
): Promise<DiffRevertResult> {
  try {
    // Read current content
    const currentContent = await readTextFile(skillPath);
    if (currentContent === null) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    // Reverse the diff
    const reversedDiff = reverseDiff(diffString);

    // Apply the reversed diff
    const restoredContent = applyPatch(currentContent, reversedDiff);

    if (restoredContent === false) {
      return {
        success: false,
        error: 'Failed to revert diff - current file content has changed',
      };
    }

    // Write the restored content
    await writeTextFile(skillPath, restoredContent);

    return {
      success: true,
      restoredContent,
    };
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error: ${(err as Error).message}`,
    };
  }
}

/**
 * Restore from backup file directly
 */
export async function restoreFromBackup(
  skillPath: string,
  historyId: string
): Promise<DiffRevertResult> {
  try {
    const backupPath = getHistoryBackupPath(historyId);
    const backupContent = await readTextFile(backupPath);

    if (backupContent === null) {
      return {
        success: false,
        error: 'Backup file not found',
      };
    }

    // Write the backup content
    await writeTextFile(skillPath, backupContent);

    return {
      success: true,
      restoredContent: backupContent,
    };
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error: ${(err as Error).message}`,
    };
  }
}

/**
 * Validate that a diff can be applied to current file content
 */
export async function validateDiff(
  skillPath: string,
  diffString: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const exists = await fileExists(skillPath);
    let originalContent = '';

    if (exists) {
      const content = await readTextFile(skillPath);
      if (content === null) {
        return { valid: false, error: 'Failed to read file' };
      }
      originalContent = content;
    }

    const result = applyPatch(originalContent, diffString);

    if (result === false) {
      return { valid: false, error: 'Diff does not match current file content' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Preview what content would look like after applying diff
 */
export async function previewDiff(
  skillPath: string,
  diffString: string
): Promise<{ success: boolean; preview?: string; error?: string }> {
  try {
    const exists = await fileExists(skillPath);
    let originalContent = '';

    if (exists) {
      const content = await readTextFile(skillPath);
      if (content === null) {
        return { success: false, error: 'Failed to read file' };
      }
      originalContent = content;
    }

    const result = applyPatch(originalContent, diffString);

    if (result === false) {
      return { success: false, error: 'Diff does not match current file content' };
    }

    return { success: true, preview: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
