/**
 * History Service
 * Manages history entries for applied changes
 */

import { v4 as uuidv4 } from 'uuid';
import {
  readJsonFile,
  writeJsonFile,
  listJsonFiles,
  getHistoryDir,
  getHistoryPath,
  deleteFile,
  getArchivedDir,
} from '../utils/fileUtils';
import {
  readAllFromArchives,
  findEntryInArchives,
} from '../utils/archiveReader';
import {
  HistoryEntry,
  HistoryQueryParams,
  PaginatedResponse,
  ApiResponse,
} from '../types';

/**
 * Create a new history entry
 */
export async function createHistoryEntry(entry: HistoryEntry): Promise<HistoryEntry> {
  const filePath = getHistoryPath(entry.id);
  await writeJsonFile(filePath, entry);
  return entry;
}

/**
 * Get a history entry by ID
 * Searches in the following order:
 * 1. Root directory (backward compatibility)
 * 2. archived/ directory (merged archive files)
 */
export async function getHistoryEntry(id: string): Promise<HistoryEntry | null> {
  // 1. Check root directory first (backward compatibility)
  const filePath = getHistoryPath(id);
  let entry = await readJsonFile<HistoryEntry>(filePath);

  // 2. If not found, search in archived files
  if (!entry) {
    const dirs = [
      getHistoryDir(),          // Root directory (history/)
      getArchivedDir('history'), // Archived directory (history/archived/)
    ];
    entry = await findEntryInArchives<HistoryEntry>(dirs, 'id', id);
  }

  return entry;
}

/**
 * List all history entries with optional filters
 * Reads from:
 * 1. Root directory (history/) - backward compatibility
 * 2. archived/ directory (history/archived/) - merged archive files
 */
export async function listHistoryEntries(
  params: HistoryQueryParams = {}
): Promise<PaginatedResponse<HistoryEntry>> {
  // Define directories to read from (in priority order)
  // readAllFromArchives will automatically read from archived/ subdirectories
  const dirs = [
    getHistoryDir(),          // Root directory (history/) - includes archived/ subdirectory
  ];

  // Create filter function based on query params
  const filter = (entry: HistoryEntry): boolean => {
    // Filter by skillName if provided
    if (params.skillName && entry.skillName !== params.skillName) {
      return false;
    }
    // Filter by search if provided
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      return (
        entry.skillName.toLowerCase().includes(searchLower) ||
        entry.proposalId.toLowerCase().includes(searchLower) ||
        entry.skillPath.toLowerCase().includes(searchLower)
      );
    }
    return true;
  };

  // Read all history entries from all directories
  const entries = await readAllFromArchives<HistoryEntry>(dirs, filter);

  // Sort by appliedAt descending (most recent first)
  entries.sort((a, b) => 
    new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
  );

  // Apply limit
  const limit = params.limit;
  const limitedEntries = limit ? entries.slice(0, limit) : entries;

  return {
    success: true,
    data: limitedEntries,
    total: entries.length,
    limit: limit || entries.length,
  };
}

/**
 * Update a history entry (e.g., mark as rolled back)
 */
export async function updateHistoryEntry(
  id: string,
  updates: Partial<HistoryEntry>
): Promise<HistoryEntry | null> {
  const entry = await getHistoryEntry(id);
  if (!entry) {
    return null;
  }

  const updated: HistoryEntry = {
    ...entry,
    ...updates,
    id: entry.id, // Ensure ID cannot be changed
  };

  const filePath = getHistoryPath(id);
  await writeJsonFile(filePath, updated);
  return updated;
}

/**
 * Mark a history entry as rolled back
 */
export async function markAsRolledBack(id: string): Promise<HistoryEntry | null> {
  return updateHistoryEntry(id, {
    rolledBackAt: new Date().toISOString(),
  });
}

/**
 * Get history entries for a specific proposal
 */
export async function getHistoryByProposalId(
  proposalId: string
): Promise<HistoryEntry[]> {
  const files = await listJsonFiles(getHistoryDir());
  const entries: HistoryEntry[] = [];

  for (const file of files) {
    const entry = await readJsonFile<HistoryEntry>(file);
    if (entry && entry.proposalId === proposalId) {
      entries.push(entry);
    }
  }

  // Sort by appliedAt descending
  entries.sort((a, b) => 
    new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
  );

  return entries;
}

/**
 * Get the most recent history entry for a skill
 */
export async function getLatestHistoryForSkill(
  skillName: string
): Promise<HistoryEntry | null> {
  const result = await listHistoryEntries({ skillName, limit: 1 });
  return result.data.length > 0 ? result.data[0] : null;
}

/**
 * Check if a history entry can be rolled back
 * (not already rolled back and is the most recent change for that skill)
 */
export async function canRollback(id: string): Promise<{ 
  canRollback: boolean; 
  reason?: string 
}> {
  const entry = await getHistoryEntry(id);
  
  if (!entry) {
    return { canRollback: false, reason: 'History entry not found' };
  }

  if (entry.rolledBackAt) {
    return { canRollback: false, reason: 'Already rolled back' };
  }

  // Check if this is the most recent entry for this skill
  const latest = await getLatestHistoryForSkill(entry.skillName);
  if (latest && latest.id !== id) {
    return { 
      canRollback: false, 
      reason: 'Cannot rollback: newer changes exist for this skill' 
    };
  }

  return { canRollback: true };
}

/**
 * Delete a history entry (used for cleanup)
 */
export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const filePath = getHistoryPath(id);
  return deleteFile(filePath);
}

/**
 * Get statistics about history
 */
export async function getHistoryStats(): Promise<{
  total: number;
  rolledBack: number;
  byScope: { user: number; project: number };
}> {
  const files = await listJsonFiles(getHistoryDir());
  let total = 0;
  let rolledBack = 0;
  const byScope = { user: 0, project: 0 };

  for (const file of files) {
    const entry = await readJsonFile<HistoryEntry>(file);
    if (entry) {
      total++;
      if (entry.rolledBackAt) rolledBack++;
      byScope[entry.scope]++;
    }
  }

  return { total, rolledBack, byScope };
}
