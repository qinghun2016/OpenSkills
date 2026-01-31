/**
 * Scheduler configuration loading
 * Extracted from index for separation of concerns
 */

import * as path from 'path';
import * as fs from 'fs';
import { DIR_OPENSKILLS, CONFIG_FILE } from '../constants/paths';
import type { SchedulerConfig } from '../scheduler';

/**
 * Workspace root: WORKSPACE_ROOT env, or OPENSKILLS_WORKSPACE (relative to cwd), or cwd if inside packages → repo root.
 * Matches fileUtils.getBaseDir() so crawler/config find .openskills when API runs from packages/api (e.g. npm run dev).
 */
export function getWorkspaceRoot(): string {
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

export function getOpenskillsPath(): string {
  if (process.env.OPENSKILLS_PATH) {
    return process.env.OPENSKILLS_PATH;
  }
  return path.resolve(getWorkspaceRoot(), DIR_OPENSKILLS);
}

export function loadSchedulerConfig(): SchedulerConfig | null {
  const openskillsPath = getOpenskillsPath();
  const workspaceRoot = getWorkspaceRoot();
  const configPath = path.join(openskillsPath, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    console.warn(`[Scheduler] Config not found at: ${configPath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    return {
      openskillsPath,
      workspaceRoot,
      wake: {
        enabled: config.wake?.enabled ?? true,
        schedule: config.wake?.schedule ?? '0 */4 * * *',
        reminderPrompt: config.wake?.reminderPrompt ?? '检查 pending proposals 并继续审查',
      },
      crawl: {
        enabled: config.crawl?.enabled ?? true,
        schedule: config.crawl?.schedule ?? '0 */4 * * *',
        minStars: config.crawl?.minStars,
        topics: config.crawl?.topics,
        githubToken: process.env.GITHUB_TOKEN || config.crawl?.githubToken,
      },
      handoff: {
        maxContextTokens: config.handoff?.maxContextTokens ?? 50000,
        compressWhenAbove: config.handoff?.compressWhenAbove ?? 40000,
      },
      merge: {
        enabled: config.merge?.enabled ?? true,
        schedule: config.merge?.schedule ?? '0 3 * * *',
        threshold: {
          fileCount: config.merge?.threshold?.fileCount ?? 100,
          retentionDays: config.merge?.threshold?.retentionDays ?? 30,
        },
        strategy: {
          byDate: config.merge?.strategy?.byDate ?? true,
          byStatus: config.merge?.strategy?.byStatus ?? true,
          archiveOld: config.merge?.strategy?.archiveOld ?? true,
        },
        lockTimeout: config.merge?.lockTimeout ?? 1800,
      },
    };
  } catch (error) {
    console.error('[Scheduler] Error loading config:', error);
    return null;
  }
}
