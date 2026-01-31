/**
 * Merge Service
 * Handles merging and archiving of proposals, decisions, and history files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import {
  getProposalsDir,
  getDecisionsDir,
  getHistoryDir,
  getHistoryBackupsDir,
  getMergeTempDir,
  getMergeHistoryDir,
  getArchivedDir,
  getActiveDir,
  getOldFilesDir,
  getCrawlerRunsDir,
  getArchivedCrawlerRunsDir,
  getWakeHistoryDir,
  getArchivedWakeHistoryDir,
  getRewardsHistoryDir,
  getArchivedRewardsHistoryDir,
  readJsonFile,
  writeJsonFile,
  listJsonFiles,
  listFiles,
  ensureDir,
  deleteFile,
  atomicMove,
  fileExists,
} from '../utils/fileUtils';
import { checkAgentOperation } from '../utils/lockUtils';
import { Proposal, Decision, HistoryEntry } from '../types';
import { CrawlRunRecord } from '../crawler';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Merge configuration
 */
export interface MergeConfig {
  enabled: boolean;
  schedule?: string;
  threshold: {
    fileCount: number;
    retentionDays: number;
  };
  strategy: {
    byDate: boolean;
    byStatus: boolean;
    archiveOld: boolean;
  };
  lockTimeout?: number;
}

/**
 * Merge options
 */
export interface MergeOptions {
  byDate?: boolean;
  byStatus?: boolean;
  archiveOld?: boolean;
  retentionDays?: number;
  fileCountThreshold?: number;
}

/**
 * Merged archive file structure
 */
interface MergedArchive {
  archivedAt: string;
  count: number;
  entries: Array<Proposal | Decision | HistoryEntry | CrawlRunRecord | WakeRecord>;
}

/**
 * Wake record interface
 */
interface WakeRecord {
  timestamp: string;
  pendingCount: number;
  reminderPrompt: string;
  triggered: boolean;
}

/**
 * Merge result
 */
export interface MergeResult {
  success: boolean;
  proposals?: {
    merged: number;
    archived: number;
    active: number;
  };
  decisions?: {
    merged: number;
    archived: number;
  };
  history?: {
    merged: number;
    archived: number;
  };
  crawlerRuns?: {
    merged: number;
    archived: number;
  };
  wakeHistory?: {
    merged: number;
    archived: number;
  };
  rewardsHistory?: {
    merged: number;
    archived: number;
  };
  historyBackupsCleaned?: number;
  mergeHistoryTrimmed?: number;
  error?: string;
}

/**
 * Reward record (file: {timestamp}-{proposalId}.json in rewards/history)
 */
interface RewardRecordForMerge {
  timestamp: string;
  proposalId: string;
  [key: string]: unknown;
}

/**
 * Get date string for grouping (YYYY-MM-DD, YYYY-MM, or YYYY)
 */
function getDateGroup(date: Date, groupBy: 'day' | 'month' | 'year' = 'day'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  switch (groupBy) {
    case 'year':
      return `${year}`;
    case 'month':
      return `${year}-${month}`;
    case 'day':
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Get creation date from a file
 */
function getFileDate(file: Proposal | Decision | HistoryEntry | CrawlRunRecord | WakeRecord): Date {
  if ('proposerMeta' in file && file.proposerMeta?.createdAt) {
    return new Date(file.proposerMeta.createdAt);
  }
  if ('decidedAt' in file) {
    return new Date(file.decidedAt);
  }
  if ('appliedAt' in file) {
    return new Date(file.appliedAt);
  }
  if ('startedAt' in file) {
    return new Date(file.startedAt);
  }
  if ('timestamp' in file) {
    return new Date(file.timestamp);
  }
  // Fallback to current date
  return new Date();
}

/**
 * Check if a file is old enough to archive
 */
function isOldFile(file: Proposal | Decision | HistoryEntry | CrawlRunRecord | WakeRecord, retentionDays: number): boolean {
  const fileDate = getFileDate(file);
  const now = new Date();
  const diffDays = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= retentionDays;
}

/**
 * Merge proposals
 */
export async function mergeProposals(options: MergeOptions = {}): Promise<{
  merged: number;
  archived: number;
  active: number;
}> {
  const proposalsDir = getProposalsDir();
  const activeDir = getActiveDir('proposals');
  const archivedDir = getArchivedDir('proposals');
  const oldDir = getOldFilesDir('proposals');
  const tempDir = getMergeTempDir();

  await ensureDir(activeDir);
  await ensureDir(archivedDir);
  await ensureDir(oldDir);
  await ensureDir(tempDir);

  const files = await listJsonFiles(proposalsDir);
  const proposals: Proposal[] = [];
  const filesToDelete: string[] = [];

  // Read all proposals
  for (const filePath of files) {
    // Skip if already in subdirectories (handle both Windows and Unix paths)
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/active/') || normalizedPath.includes('/archived/') || normalizedPath.includes('/old/')) {
      continue;
    }

    const proposal = await readJsonFile<Proposal>(filePath);
    if (proposal) {
      proposals.push(proposal);
      filesToDelete.push(filePath);
    }
  }

  let merged = 0;
  let archived = 0;
  let active = 0;

  // Separate by status
  const pendingProposals = proposals.filter(p => p.status === 'pending');
  const processedProposals = proposals.filter(p => p.status !== 'pending');

  // Move pending proposals to active directory
  for (const proposal of pendingProposals) {
    const activePath = path.join(activeDir, `${proposal.id}.json`);
    const originalPath = path.join(proposalsDir, `${proposal.id}.json`);
    if (await fileExists(originalPath)) {
      await atomicMove(originalPath, activePath);
      active++;
    }
  }

  // Merge processed proposals
  if (processedProposals.length > 0) {
    if (options.byStatus) {
      // Group by status
      const byStatus: Record<string, Proposal[]> = {};
      for (const proposal of processedProposals) {
        const status = proposal.status;
        if (!byStatus[status]) {
          byStatus[status] = [];
        }
        byStatus[status].push(proposal);
      }

      // Create merged files by status
      for (const [status, statusProposals] of Object.entries(byStatus)) {
        if (options.byDate) {
          // Further group by date
          const byDate: Record<string, Proposal[]> = {};
          for (const proposal of statusProposals) {
            const dateGroup = getDateGroup(getFileDate(proposal), 'day');
            if (!byDate[dateGroup]) {
              byDate[dateGroup] = [];
            }
            byDate[dateGroup].push(proposal);
          }

          // Create merged files by date
          for (const [dateGroup, dateProposals] of Object.entries(byDate)) {
            const archive: MergedArchive = {
              archivedAt: new Date().toISOString(),
              count: dateProposals.length,
              entries: dateProposals,
            };

            const archiveFileName = `${status}-${dateGroup}.json`;
            const tempArchivePath = path.join(tempDir, archiveFileName);
            const archivePath = path.join(archivedDir, archiveFileName);

            await writeJsonFile(tempArchivePath, archive);
            await atomicMove(tempArchivePath, archivePath);

            // Delete original files
            for (const proposal of dateProposals) {
              const originalPath = path.join(proposalsDir, `${proposal.id}.json`);
              if (await fileExists(originalPath)) {
                await deleteFile(originalPath);
              }
            }

            merged += dateProposals.length;
            archived += dateProposals.length;
          }
        } else {
          // Merge all by status
          const archive: MergedArchive = {
            archivedAt: new Date().toISOString(),
            count: statusProposals.length,
            entries: statusProposals,
          };

          const archiveFileName = `${status}-${getDateGroup(new Date(), 'month')}.json`;
          const tempArchivePath = path.join(tempDir, archiveFileName);
          const archivePath = path.join(archivedDir, archiveFileName);

          await writeJsonFile(tempArchivePath, archive);
          await atomicMove(tempArchivePath, archivePath);

          // Delete original files
          for (const proposal of statusProposals) {
            const originalPath = path.join(proposalsDir, `${proposal.id}.json`);
            if (await fileExists(originalPath)) {
              await deleteFile(originalPath);
            }
          }

          merged += statusProposals.length;
          archived += statusProposals.length;
        }
      }
    } else if (options.byDate) {
      // Group only by date
      const byDate: Record<string, Proposal[]> = {};
      for (const proposal of processedProposals) {
        const dateGroup = getDateGroup(getFileDate(proposal), 'day');
        if (!byDate[dateGroup]) {
          byDate[dateGroup] = [];
        }
        byDate[dateGroup].push(proposal);
      }

      // Create merged files by date
      for (const [dateGroup, dateProposals] of Object.entries(byDate)) {
        const archive: MergedArchive = {
          archivedAt: new Date().toISOString(),
          count: dateProposals.length,
          entries: dateProposals,
        };

        const archiveFileName = `${dateGroup}.json`;
        const tempArchivePath = path.join(tempDir, archiveFileName);
        const archivePath = path.join(archivedDir, archiveFileName);

        await writeJsonFile(tempArchivePath, archive);
        await atomicMove(tempArchivePath, archivePath);

        // Delete original files
        for (const proposal of dateProposals) {
          const originalPath = path.join(proposalsDir, `${proposal.id}.json`);
          if (await fileExists(originalPath)) {
            await deleteFile(originalPath);
          }
        }

        merged += dateProposals.length;
        archived += dateProposals.length;
      }
    } else {
      // Simple merge all processed proposals
      const archive: MergedArchive = {
        archivedAt: new Date().toISOString(),
        count: processedProposals.length,
        entries: processedProposals,
      };

      const archiveFileName = `${getDateGroup(new Date(), 'month')}.json`;
      const tempArchivePath = path.join(tempDir, archiveFileName);
      const archivePath = path.join(archivedDir, archiveFileName);

      await writeJsonFile(tempArchivePath, archive);
      await atomicMove(tempArchivePath, archivePath);

      // Delete original files
      for (const proposal of processedProposals) {
        const originalPath = path.join(proposalsDir, `${proposal.id}.json`);
        if (await fileExists(originalPath)) {
          await deleteFile(originalPath);
        }
      }

      merged += processedProposals.length;
      archived += processedProposals.length;
    }
  }

  return { merged, archived, active };
}

/**
 * Merge decisions
 */
export async function mergeDecisions(options: MergeOptions = {}): Promise<{
  merged: number;
  archived: number;
}> {
  const decisionsDir = getDecisionsDir();
  const archivedDir = getArchivedDir('decisions');
  const oldDir = getOldFilesDir('decisions');
  const tempDir = getMergeTempDir();

  await ensureDir(archivedDir);
  await ensureDir(oldDir);
  await ensureDir(tempDir);

  const files = await listJsonFiles(decisionsDir);
  const decisions: Decision[] = [];

  // Read all decisions
  for (const filePath of files) {
    // Skip if already in subdirectories (handle both Windows and Unix paths)
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/archived/') || normalizedPath.includes('/old/')) {
      continue;
    }

    const decision = await readJsonFile<Decision>(filePath);
    if (decision) {
      decisions.push(decision);
    }
  }

  let merged = 0;
  let archived = 0;

  if (decisions.length === 0) {
    return { merged: 0, archived: 0 };
  }

  if (options.byDate) {
    // Group by date
    const byDate: Record<string, Decision[]> = {};
    for (const decision of decisions) {
      const dateGroup = getDateGroup(getFileDate(decision), 'day');
      if (!byDate[dateGroup]) {
        byDate[dateGroup] = [];
      }
      byDate[dateGroup].push(decision);
    }

    // Create merged files by date
    for (const [dateGroup, dateDecisions] of Object.entries(byDate)) {
      const archive: MergedArchive = {
        archivedAt: new Date().toISOString(),
        count: dateDecisions.length,
        entries: dateDecisions,
      };

      const archiveFileName = `${dateGroup}.json`;
      const tempArchivePath = path.join(tempDir, archiveFileName);
      const archivePath = path.join(archivedDir, archiveFileName);

      await writeJsonFile(tempArchivePath, archive);
      await atomicMove(tempArchivePath, archivePath);

      // Delete original files
      for (const decision of dateDecisions) {
        const originalPath = path.join(decisionsDir, `${decision.proposalId}.json`);
        if (await fileExists(originalPath)) {
          await deleteFile(originalPath);
        }
      }

      merged += dateDecisions.length;
      archived += dateDecisions.length;
    }
  } else {
    // Simple merge all
    const archive: MergedArchive = {
      archivedAt: new Date().toISOString(),
      count: decisions.length,
      entries: decisions,
    };

    const archiveFileName = `${getDateGroup(new Date(), 'month')}.json`;
    const tempArchivePath = path.join(tempDir, archiveFileName);
    const archivePath = path.join(archivedDir, archiveFileName);

    await writeJsonFile(tempArchivePath, archive);
    await atomicMove(tempArchivePath, archivePath);

    // Delete original files
    for (const decision of decisions) {
      const originalPath = path.join(decisionsDir, `${decision.proposalId}.json`);
      if (await fileExists(originalPath)) {
        await deleteFile(originalPath);
      }
    }

    merged += decisions.length;
    archived += decisions.length;
  }

  return { merged, archived };
}

/**
 * Merge history entries
 */
export async function mergeHistory(options: MergeOptions = {}): Promise<{
  merged: number;
  archived: number;
}> {
  const historyDir = getHistoryDir();
  const archivedDir = getArchivedDir('history');
  const oldDir = getOldFilesDir('history');
  const tempDir = getMergeTempDir();

  await ensureDir(archivedDir);
  await ensureDir(oldDir);
  await ensureDir(tempDir);

  const files = await listJsonFiles(historyDir);
  const entries: HistoryEntry[] = [];

  // Read all history entries (skip backups directory)
  for (const filePath of files) {
    // Skip if already in subdirectories or backups (handle both Windows and Unix paths)
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/archived/') || normalizedPath.includes('/old/') || normalizedPath.includes('/backups/')) {
      continue;
    }

    const entry = await readJsonFile<HistoryEntry>(filePath);
    if (entry) {
      entries.push(entry);
    }
  }

  let merged = 0;
  let archived = 0;

  if (entries.length === 0) {
    return { merged: 0, archived: 0 };
  }

  if (options.byDate) {
    // Group by date
    const byDate: Record<string, HistoryEntry[]> = {};
    for (const entry of entries) {
      const dateGroup = getDateGroup(getFileDate(entry), 'day');
      if (!byDate[dateGroup]) {
        byDate[dateGroup] = [];
      }
      byDate[dateGroup].push(entry);
    }

    // Create merged files by date
    for (const [dateGroup, dateEntries] of Object.entries(byDate)) {
      const archive: MergedArchive = {
        archivedAt: new Date().toISOString(),
        count: dateEntries.length,
        entries: dateEntries,
      };

      const archiveFileName = `${dateGroup}.json`;
      const tempArchivePath = path.join(tempDir, archiveFileName);
      const archivePath = path.join(archivedDir, archiveFileName);

      await writeJsonFile(tempArchivePath, archive);
      await atomicMove(tempArchivePath, archivePath);

      // Delete original files
      for (const entry of dateEntries) {
        const originalPath = path.join(historyDir, `${entry.id}.json`);
        if (await fileExists(originalPath)) {
          await deleteFile(originalPath);
        }
      }

      merged += dateEntries.length;
      archived += dateEntries.length;
    }
  } else {
    // Simple merge all
    const archive: MergedArchive = {
      archivedAt: new Date().toISOString(),
      count: entries.length,
      entries: entries,
    };

    const archiveFileName = `${getDateGroup(new Date(), 'month')}.json`;
    const tempArchivePath = path.join(tempDir, archiveFileName);
    const archivePath = path.join(archivedDir, archiveFileName);

    await writeJsonFile(tempArchivePath, archive);
    await atomicMove(tempArchivePath, archivePath);

    // Delete original files
    for (const entry of entries) {
      const originalPath = path.join(historyDir, `${entry.id}.json`);
      if (await fileExists(originalPath)) {
        await deleteFile(originalPath);
      }
    }

    merged += entries.length;
    archived += entries.length;
  }

  return { merged, archived };
}

/**
 * Merge crawler runs
 */
export async function mergeCrawlerRuns(options: MergeOptions = {}): Promise<{
  merged: number;
  archived: number;
}> {
  const runsDir = getCrawlerRunsDir();
  const archivedDir = getArchivedCrawlerRunsDir();
  const tempDir = getMergeTempDir();

  await ensureDir(archivedDir);
  await ensureDir(tempDir);

  const files = await listJsonFiles(runsDir);
  const runs: Array<{ run: CrawlRunRecord; filePath: string }> = [];

  // Read all crawler runs
  for (const filePath of files) {
    // Skip if already in subdirectories (handle both Windows and Unix paths)
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/archived/') || normalizedPath.includes('/old/')) {
      continue;
    }

    const run = await readJsonFile<CrawlRunRecord>(filePath);
    if (run) {
      runs.push({ run, filePath });
    }
  }

  let merged = 0;
  let archived = 0;

  if (runs.length === 0) {
    return { merged: 0, archived: 0 };
  }

  if (options.byDate) {
    // Group by date
    const byDate: Record<string, Array<{ run: CrawlRunRecord; filePath: string }>> = {};
    for (const item of runs) {
      const dateGroup = getDateGroup(getFileDate(item.run), 'day');
      if (!byDate[dateGroup]) {
        byDate[dateGroup] = [];
      }
      byDate[dateGroup].push(item);
    }

    // Create merged files by date
    for (const [dateGroup, dateItems] of Object.entries(byDate)) {
      const dateRuns = dateItems.map(item => item.run);
      const archive: MergedArchive = {
        archivedAt: new Date().toISOString(),
        count: dateRuns.length,
        entries: dateRuns,
      };

      const archiveFileName = `${dateGroup}.json`;
      const tempArchivePath = path.join(tempDir, archiveFileName);
      const archivePath = path.join(archivedDir, archiveFileName);

      await writeJsonFile(tempArchivePath, archive);
      await atomicMove(tempArchivePath, archivePath);

      // Delete original files using the stored file paths
      for (const item of dateItems) {
        if (await fileExists(item.filePath)) {
          await deleteFile(item.filePath);
        }
      }

      merged += dateRuns.length;
      archived += dateRuns.length;
    }
  } else {
    // Simple merge all
    const allRuns = runs.map(item => item.run);
    const archive: MergedArchive = {
      archivedAt: new Date().toISOString(),
      count: allRuns.length,
      entries: allRuns,
    };

    const archiveFileName = `${getDateGroup(new Date(), 'month')}.json`;
    const tempArchivePath = path.join(tempDir, archiveFileName);
    const archivePath = path.join(archivedDir, archiveFileName);

    await writeJsonFile(tempArchivePath, archive);
    await atomicMove(tempArchivePath, archivePath);

    // Delete original files using the stored file paths
    for (const item of runs) {
      if (await fileExists(item.filePath)) {
        await deleteFile(item.filePath);
      }
    }

    merged += runs.length;
    archived += runs.length;
  }

  return { merged, archived };
}

/**
 * Merge wake history records
 */
export async function mergeWakeHistory(options: MergeOptions = {}): Promise<{
  merged: number;
  archived: number;
}> {
  const historyDir = getWakeHistoryDir();
  const archivedDir = getArchivedWakeHistoryDir();
  const tempDir = getMergeTempDir();

  await ensureDir(archivedDir);
  await ensureDir(tempDir);

  const files = await listJsonFiles(historyDir);
  const records: Array<{ record: WakeRecord; filePath: string }> = [];

  // Read all wake history records
  for (const filePath of files) {
    // Skip if already in subdirectories (handle both Windows and Unix paths)
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/archived/') || normalizedPath.includes('/old/')) {
      continue;
    }

    const record = await readJsonFile<WakeRecord>(filePath);
    if (record) {
      records.push({ record, filePath });
    }
  }

  let merged = 0;
  let archived = 0;

  if (records.length === 0) {
    return { merged: 0, archived: 0 };
  }

  if (options.byDate) {
    // Group by date
    const byDate: Record<string, Array<{ record: WakeRecord; filePath: string }>> = {};
    for (const item of records) {
      const dateGroup = getDateGroup(getFileDate(item.record), 'day');
      if (!byDate[dateGroup]) {
        byDate[dateGroup] = [];
      }
      byDate[dateGroup].push(item);
    }

    // Create merged files by date
    for (const [dateGroup, dateItems] of Object.entries(byDate)) {
      const dateRecords = dateItems.map(item => item.record);
      const archive: MergedArchive = {
        archivedAt: new Date().toISOString(),
        count: dateRecords.length,
        entries: dateRecords,
      };

      const archiveFileName = `${dateGroup}.json`;
      const tempArchivePath = path.join(tempDir, archiveFileName);
      const archivePath = path.join(archivedDir, archiveFileName);

      await writeJsonFile(tempArchivePath, archive);
      await atomicMove(tempArchivePath, archivePath);

      // Delete original files
      for (const item of dateItems) {
        if (await fileExists(item.filePath)) {
          await deleteFile(item.filePath);
        }
      }

      merged += dateRecords.length;
      archived += dateRecords.length;
    }
  } else {
    // Simple merge all
    const allRecords = records.map(item => item.record);
    const archive: MergedArchive = {
      archivedAt: new Date().toISOString(),
      count: allRecords.length,
      entries: allRecords,
    };

    const archiveFileName = `${getDateGroup(new Date(), 'month')}.json`;
    const tempArchivePath = path.join(tempDir, archiveFileName);
    const archivePath = path.join(archivedDir, archiveFileName);

    await writeJsonFile(tempArchivePath, archive);
    await atomicMove(tempArchivePath, archivePath);

    // Delete original files
    for (const item of records) {
      if (await fileExists(item.filePath)) {
        await deleteFile(item.filePath);
      }
    }

    merged += records.length;
    archived += records.length;
  }

  return { merged, archived };
}

/**
 * Merge rewards history (files: {timestamp}-{proposalId}.json)
 */
export async function mergeRewardsHistory(options: MergeOptions = {}): Promise<{
  merged: number;
  archived: number;
}> {
  const rewardsHistoryDir = getRewardsHistoryDir();
  const archivedDir = getArchivedRewardsHistoryDir();
  const tempDir = getMergeTempDir();

  try {
    await ensureDir(archivedDir);
    await ensureDir(tempDir);
  } catch {
    return { merged: 0, archived: 0 };
  }

  const files = await listJsonFiles(rewardsHistoryDir);
  const entries: Array<{ record: RewardRecordForMerge; filePath: string; dateGroup: string }> = [];

  for (const filePath of files) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('/archived/')) continue;

    const basename = path.basename(filePath, '.json');
    const match = /^(\d+)-([0-9a-f-]+)$/i.exec(basename);
    if (!match) continue;

    const ts = parseInt(match[1], 10);
    const record = await readJsonFile<RewardRecordForMerge>(filePath);
    if (!record) continue;

    const dateGroup = getDateGroup(new Date(ts), 'day');
    entries.push({ record, filePath, dateGroup });
  }

  let merged = 0;
  let archived = 0;

  if (entries.length === 0) {
    return { merged: 0, archived: 0 };
  }

  if (options.byDate) {
    const byDate: Record<string, typeof entries> = {};
    for (const item of entries) {
      if (!byDate[item.dateGroup]) byDate[item.dateGroup] = [];
      byDate[item.dateGroup].push(item);
    }

    for (const [dateGroup, dateItems] of Object.entries(byDate)) {
      const records = dateItems.map(i => i.record);
      const archive: MergedArchive = {
        archivedAt: new Date().toISOString(),
        count: records.length,
        entries: records as MergedArchive['entries'],
      };

      const archiveFileName = `rewards-${dateGroup}.json`;
      const tempArchivePath = path.join(tempDir, archiveFileName);
      const archivePath = path.join(archivedDir, archiveFileName);

      await writeJsonFile(tempArchivePath, archive);
      await atomicMove(tempArchivePath, archivePath);

      for (const item of dateItems) {
        if (await fileExists(item.filePath)) {
          await deleteFile(item.filePath);
        }
      }
      merged += records.length;
      archived += records.length;
    }
  } else {
    const records = entries.map(i => i.record);
    const archive: MergedArchive = {
      archivedAt: new Date().toISOString(),
      count: records.length,
      entries: records as MergedArchive['entries'],
    };

    const archiveFileName = `rewards-${getDateGroup(new Date(), 'month')}.json`;
    const tempArchivePath = path.join(tempDir, archiveFileName);
    const archivePath = path.join(archivedDir, archiveFileName);

    await writeJsonFile(tempArchivePath, archive);
    await atomicMove(tempArchivePath, archivePath);

    for (const item of entries) {
      if (await fileExists(item.filePath)) {
        await deleteFile(item.filePath);
      }
    }
    merged += records.length;
    archived += records.length;
  }

  return { merged, archived };
}

/**
 * Delete history backup files older than retentionDays (files: {id}.backup)
 */
export async function cleanHistoryBackups(retentionDays: number): Promise<number> {
  const backupsDir = getHistoryBackupsDir();
  try {
    const files = await listFiles(backupsDir);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const filePath of files) {
      if (!filePath.endsWith('.backup')) continue;
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) {
          await deleteFile(filePath);
          deleted++;
        }
      } catch {
        // skip
      }
    }
    return deleted;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw err;
  }
}

/**
 * Delete merge run history files older than retentionDays (files: {timestamp}.json)
 */
export async function trimMergeHistory(retentionDays: number): Promise<number> {
  const mergeHistoryDir = getMergeHistoryDir();
  try {
    const files = await listJsonFiles(mergeHistoryDir);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const filePath of files) {
      const basename = path.basename(filePath, '.json');
      const ts = parseInt(basename, 10);
      if (Number.isNaN(ts) || ts < cutoff) {
        await deleteFile(filePath);
        deleted++;
      }
    }
    return deleted;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw err;
  }
}

/**
 * Archive old files to compressed archives
 */
export async function archiveOldFiles(
  type: 'proposals' | 'decisions' | 'history',
  retentionDays: number
): Promise<number> {
  const baseDir = type === 'proposals' 
    ? getProposalsDir() 
    : type === 'decisions' 
    ? getDecisionsDir() 
    : getHistoryDir();
  const archivedDir = getArchivedDir(type);
  const oldDir = getOldFilesDir(type);
  const tempDir = getMergeTempDir();

  await ensureDir(oldDir);
  await ensureDir(tempDir);

  // Read archived files
  const archivedFiles = await listJsonFiles(archivedDir);
  const oldArchives: string[] = [];

  for (const filePath of archivedFiles) {
    const archive = await readJsonFile<MergedArchive>(filePath);
    if (archive) {
      // Check if archive is old based on archivedAt
      const archiveDate = new Date(archive.archivedAt);
      const now = new Date();
      const diffDays = (now.getTime() - archiveDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (diffDays >= retentionDays) {
        oldArchives.push(filePath);
      }
    }
  }

  if (oldArchives.length === 0) {
    return 0;
  }

  // Group old archives by month for compression
  const byMonth: Record<string, string[]> = {};
  for (const filePath of oldArchives) {
    const archive = await readJsonFile<MergedArchive>(filePath);
    if (archive) {
      const month = getDateGroup(new Date(archive.archivedAt), 'month');
      if (!byMonth[month]) {
        byMonth[month] = [];
      }
      byMonth[month].push(filePath);
    }
  }

  let archivedCount = 0;

  // Compress each month's archives
  for (const [month, monthFiles] of Object.entries(byMonth)) {
    // Read all archives for this month
    const allEntries: MergedArchive['entries'] = [];
    for (const filePath of monthFiles) {
      const archive = await readJsonFile<MergedArchive>(filePath);
      if (archive && archive.entries) {
        allEntries.push(...archive.entries);
      }
    }

    // Create compressed archive
    const compressedArchive: MergedArchive = {
      archivedAt: new Date().toISOString(),
      count: allEntries.length,
      entries: allEntries,
    };

    const jsonContent = JSON.stringify(compressedArchive, null, 2);
    const compressed = await gzip(Buffer.from(jsonContent, 'utf-8'));

    const archiveFileName = `${type}-${month}.gz`;
    const tempArchivePath = path.join(tempDir, archiveFileName);
    const archivePath = path.join(oldDir, archiveFileName);

    await fs.writeFile(tempArchivePath, compressed);
    await atomicMove(tempArchivePath, archivePath);

    // Delete original archived files
    for (const filePath of monthFiles) {
      await deleteFile(filePath);
    }

    archivedCount += monthFiles.length;
  }

  return archivedCount;
}

/**
 * Execute complete merge process
 */
export async function executeMerge(config: MergeConfig): Promise<MergeResult> {
  // Check if agent is operating
  const agentOperating = await checkAgentOperation();
  if (agentOperating) {
    return {
      success: false,
      error: 'Agent operation in progress, skipping merge',
    };
  }

  try {
    const options: MergeOptions = {
      byDate: config.strategy.byDate,
      byStatus: config.strategy.byStatus,
      archiveOld: config.strategy.archiveOld,
      retentionDays: config.threshold.retentionDays,
      fileCountThreshold: config.threshold.fileCount,
    };

    const result: MergeResult = {
      success: true,
    };

    // Merge proposals
    const proposalsResult = await mergeProposals(options);
    result.proposals = proposalsResult;

    // Merge decisions
    const decisionsResult = await mergeDecisions(options);
    result.decisions = decisionsResult;

    // Merge history
    const historyResult = await mergeHistory(options);
    result.history = historyResult;

    // Merge crawler runs
    const crawlerRunsResult = await mergeCrawlerRuns(options);
    result.crawlerRuns = crawlerRunsResult;

    // Merge wake history
    const wakeHistoryResult = await mergeWakeHistory(options);
    result.wakeHistory = wakeHistoryResult;

    // Merge rewards history (files: {timestamp}-{proposalId}.json)
    const rewardsHistoryResult = await mergeRewardsHistory(options);
    result.rewardsHistory = rewardsHistoryResult;

    const retentionDays = config.threshold.retentionDays;

    // Clean old history backups (files: {id}.backup)
    result.historyBackupsCleaned = await cleanHistoryBackups(retentionDays);

    // Trim old merge run history (files: {timestamp}.json)
    result.mergeHistoryTrimmed = await trimMergeHistory(retentionDays);

    // Archive old files if enabled
    if (config.strategy.archiveOld) {
      await archiveOldFiles('proposals', retentionDays);
      await archiveOldFiles('decisions', retentionDays);
      await archiveOldFiles('history', retentionDays);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during merge',
    };
  }
}
