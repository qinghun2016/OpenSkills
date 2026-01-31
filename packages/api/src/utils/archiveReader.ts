/**
 * Archive Reader Utility
 * Handles reading merged archive files (both JSON and gzip compressed)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { readJsonFile, listJsonFiles, listFiles, fileExists, getBaseDir } from './fileUtils';
import { Proposal, Decision, HistoryEntry } from '../types';

const gunzip = promisify(zlib.gunzip);

// Debug logging helper
const DEBUG_LOG_PATH = path.join(getBaseDir(), '.cursor', 'debug.log');
async function debugLog(data: Record<string, unknown>): Promise<void> {
  try {
    const logLine = JSON.stringify({ ...data, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1' }) + '\n';
    await fs.appendFile(DEBUG_LOG_PATH, logLine, 'utf-8').catch(() => {});
  } catch {
    // Ignore logging errors
  }
}

/**
 * Merged archive file structure
 */
export interface MergedArchive<T> {
  archivedAt: string;
  count: number;
  entries: T[];
}

/**
 * Read a merged archive file (supports both .json and .gz files)
 * @param filePath Path to the archive file
 * @returns The merged archive data or null if file doesn't exist
 */
export async function readMergedArchive<T>(
  filePath: string
): Promise<MergedArchive<T> | null> {
  try {
    // Check if file exists
    if (!(await fileExists(filePath))) {
      return null;
    }

    // Handle gzip compressed files
    if (filePath.endsWith('.gz')) {
      const compressed = await fs.readFile(filePath);
      const decompressed = await gunzip(compressed);
      const content = decompressed.toString('utf-8');
      return JSON.parse(content) as MergedArchive<T>;
    }

    // Handle regular JSON files
    return await readJsonFile<MergedArchive<T>>(filePath);
  } catch (err) {
    // If file doesn't exist, return null
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    // Re-throw other errors
    throw err;
  }
}

/**
 * List archived files in a directory
 * @param dirPath Directory path to search
 * @param type Type of archive (proposals, decisions, history, crawler, wake)
 * @returns Array of archive file paths
 */
export async function listArchivedFiles(
  dirPath: string,
  type: 'proposals' | 'decisions' | 'history' | 'crawler' | 'wake'
): Promise<string[]> {
  try {
    // List all files (both .json and .gz)
    const allFiles = await listFiles(dirPath);
    
    // Filter for archive files (JSON and gzip)
    const archiveFiles = allFiles.filter(file => {
      const fileName = path.basename(file);
      // Archive files are typically named like: {date}.json, {status}-{date}.json, or {type}-{date}.gz
      // For wake/history, timestamp files (13 digits) ARE archive files when in archived/ directory
      // For crawler/runs, crawl-*.json files in archived/ are archive files
      if (!fileName.endsWith('.json') && !fileName.endsWith('.gz')) {
        return false;
      }
      
      // In archived directories, include all files (they are merged archives)
      // Exclude only UUID-based individual files (proposals, decisions, history entries)
      // But include timestamp files and crawl-*.json files as they are valid archive formats
      if (fileName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i)) {
        // UUID format - exclude (these are individual proposal/decision/history files)
        return false;
      }
      
      // All other files in archived/ are considered archive files
      // This includes: timestamp files (wake history), crawl-*.json (crawler runs), date-based archives
      return true;
    });

    return archiveFiles.sort();
  } catch (err) {
    // If directory doesn't exist, return empty array
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Read all entries from multiple directories (active files and archived files)
 * @param dirs Array of directory paths to read from
 * @param filter Optional filter function to apply to each entry
 * @returns Array of all entries from all directories
 */
export async function readAllFromArchives<T>(
  dirs: string[],
  filter?: (item: T) => boolean
): Promise<T[]> {
  const allEntries: T[] = [];

  for (const dir of dirs) {
    try {
      // #region agent log
      await debugLog({ location: 'utils/archiveReader.ts:109', message: 'Reading directory', data: { dir, dirExists: await fileExists(dir) }, hypothesisId: 'A' });
      // #endregion
      
      // Read individual JSON files (active files)
      const jsonFiles = await listJsonFiles(dir);
      // #region agent log
      await debugLog({ location: 'utils/archiveReader.ts:112', message: 'Found JSON files', data: { dir, jsonFilesCount: jsonFiles.length, jsonFiles: jsonFiles.map(f => path.basename(f)) }, hypothesisId: 'A' });
      // #endregion
      
      for (const filePath of jsonFiles) {
        try {
          const item = await readJsonFile<T>(filePath);
          // #region agent log
          await debugLog({ location: 'utils/archiveReader.ts:115', message: 'Read JSON file', data: { filePath: path.basename(filePath), hasItem: !!item, itemKeys: item ? Object.keys(item) : [] }, hypothesisId: 'B' });
          // #endregion
          
          if (item) {
            // Apply filter if provided
            if (!filter || filter(item)) {
              allEntries.push(item);
            } else {
              // #region agent log
              await debugLog({ location: 'utils/archiveReader.ts:120', message: 'Item filtered out', data: { filePath: path.basename(filePath) }, hypothesisId: 'C' });
              // #endregion
            }
          }
        } catch (err) {
          // #region agent log
          await debugLog({ location: 'utils/archiveReader.ts:125', message: 'Error reading JSON file', data: { filePath: path.basename(filePath), error: (err as Error).message }, hypothesisId: 'D' });
          // #endregion
          console.warn(`Error reading JSON file ${filePath}:`, err);
        }
      }

      // Read archived files (merged archives)
      const archivedDir = path.join(dir, 'archived');
      const archivedDirExists = await fileExists(archivedDir);
      // #region agent log
      await debugLog({ location: 'utils/archiveReader.ts:132', message: 'Checking archived directory', data: { archivedDir, archivedDirExists }, hypothesisId: 'E' });
      // #endregion
      
      if (archivedDirExists) {
        // Determine type from directory path
        // Extract the base directory name (e.g., 'proposals' from '.openskills/proposals' or 'proposals/active')
        const normalizedDir = dir.replace(/[\\/]active[\\/]?$/, '').replace(/[\\/]archived[\\/]?$/, '').replace(/\\/g, '/');
        const dirName = path.basename(normalizedDir);
        const parentDirName = path.basename(path.dirname(normalizedDir));
        
        // Special handling for nested directories
        let archiveType: 'proposals' | 'decisions' | 'history' | 'crawler' | 'wake';
        if (normalizedDir.includes('/wake/') || parentDirName === 'wake') {
          archiveType = 'wake';
        } else if (normalizedDir.includes('/crawled/') || parentDirName === 'crawled' || dirName === 'runs') {
          archiveType = 'crawler';
        } else if (dirName === 'proposals' || dirName === 'decisions' || dirName === 'history') {
          archiveType = dirName as 'proposals' | 'decisions' | 'history';
        } else {
          archiveType = 'proposals'; // Default fallback
        }
        
        // #region agent log
        await debugLog({ location: 'utils/archiveReader.ts:140', message: 'Determined archive type', data: { normalizedDir, dirName, archiveType }, hypothesisId: 'E' });
        // #endregion
        
        const archiveFiles = await listArchivedFiles(archivedDir, archiveType);
        // #region agent log
        await debugLog({ location: 'utils/archiveReader.ts:143', message: 'Found archive files', data: { archivedDir, archiveFilesCount: archiveFiles.length, archiveFiles: archiveFiles.map(f => path.basename(f)) }, hypothesisId: 'E' });
        // #endregion
        
        for (const archivePath of archiveFiles) {
          try {
            const archive = await readMergedArchive<T>(archivePath);
            // #region agent log
            await debugLog({ location: 'utils/archiveReader.ts:147', message: 'Read merged archive', data: { archivePath: path.basename(archivePath), hasArchive: !!archive, entriesCount: archive?.entries?.length || 0 }, hypothesisId: 'F' });
            // #endregion
            
            if (archive && archive.entries) {
              for (const entry of archive.entries) {
                // Apply filter if provided
                if (!filter || filter(entry)) {
                  allEntries.push(entry);
                }
              }
            }
          } catch (err) {
            // #region agent log
            await debugLog({ location: 'utils/archiveReader.ts:156', message: 'Error reading merged archive', data: { archivePath: path.basename(archivePath), error: (err as Error).message }, hypothesisId: 'G' });
            // #endregion
            console.warn(`Error reading merged archive ${archivePath}:`, err);
          }
        }
      }

      // Read old/compressed archives
      const oldDir = path.join(dir, 'old');
      if (await fileExists(oldDir)) {
        const oldFiles = await listFiles(oldDir);
        const compressedArchives = oldFiles.filter(f => f.endsWith('.gz'));
        for (const archivePath of compressedArchives) {
          const archive = await readMergedArchive<T>(archivePath);
          if (archive && archive.entries) {
            for (const entry of archive.entries) {
              // Apply filter if provided
              if (!filter || filter(entry)) {
                allEntries.push(entry);
              }
            }
          }
        }
      }
      
      // #region agent log
      await debugLog({ location: 'utils/archiveReader.ts:172', message: 'Finished reading directory', data: { dir, entriesCount: allEntries.length }, hypothesisId: 'H' });
      // #endregion
    } catch (err) {
      // Skip directories that don't exist or have errors
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Log but don't throw for individual directory errors
        // #region agent log
        await debugLog({ location: 'utils/archiveReader.ts:177', message: 'Error reading directory', data: { dir, error: (err as Error).message, errorCode: (err as NodeJS.ErrnoException).code }, hypothesisId: 'I' });
        // #endregion
        console.warn(`Error reading from directory ${dir}:`, err);
      }
    }
  }

  // #region agent log
  await debugLog({ location: 'utils/archiveReader.ts:185', message: 'readAllFromArchives completed', data: { totalEntries: allEntries.length, dirsCount: dirs.length }, hypothesisId: 'J' });
  // #endregion

  return allEntries;
}

/**
 * Read all entries from a specific archive directory
 * @param archivedDir Path to the archived directory
 * @param type Type of archive
 * @param filter Optional filter function
 * @returns Array of all entries from archived files
 */
export async function readFromArchivedDir<T>(
  archivedDir: string,
  type: 'proposals' | 'decisions' | 'history' | 'crawler' | 'wake',
  filter?: (item: T) => boolean
): Promise<T[]> {
  const allEntries: T[] = [];

  try {
    if (!(await fileExists(archivedDir))) {
      return [];
    }

    const archiveFiles = await listArchivedFiles(archivedDir, type);
    for (const archivePath of archiveFiles) {
      const archive = await readMergedArchive<T>(archivePath);
      if (archive && archive.entries) {
        for (const entry of archive.entries) {
          if (!filter || filter(entry)) {
            allEntries.push(entry);
          }
        }
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  return allEntries;
}

/**
 * Find a specific entry by ID from all sources (active and archived)
 * @param dirs Array of directory paths to search
 * @param idField Field name to match (e.g., 'id', 'proposalId')
 * @param idValue Value to match
 * @returns The found entry or null
 */
export async function findEntryInArchives<T extends object>(
  dirs: string[],
  idField: string,
  idValue: string
): Promise<T | null> {
  const entries = await readAllFromArchives<T>(dirs);
  for (const entry of entries) {
    if ((entry as Record<string, unknown>)[idField] === idValue) {
      return entry;
    }
  }

  return null;
}
