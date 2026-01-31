/**
 * Centralized directory and path constants for OpenSkills
 * Used across API, services, and routes to avoid hardcoded path strings
 */

export const DIR_OPENSKILLS = '.openskills';
export const DIR_CURSOR = '.cursor';
export const DIR_CLAUDE = '.claude';

export const SUBDIR_PROPOSALS = 'proposals';
export const SUBDIR_DECISIONS = 'decisions';
export const SUBDIR_HISTORY = 'history';
export const SUBDIR_SCHEMAS = 'schemas';
export const SUBDIR_SKILLS = 'skills';
export const SUBDIR_RULES = 'rules';
export const SUBDIR_CRAWLED = 'crawled';
export const SUBDIR_RUNS = 'runs';
export const SUBDIR_BACKUPS = 'backups';
export const SUBDIR_WAKE = 'wake';
export const SUBDIR_ARCHIVED = 'archived';
export const SUBDIR_ACTIVE = 'active';
export const SUBDIR_OLD = 'old';
export const SUBDIR_REWARDS = 'rewards';
export const SUBDIR_MERGE = 'merge';

export const CONFIG_FILE = 'config.json';
export const SKILL_ENTRY_FILE = 'SKILL.md';

/** Diff allowed target path prefixes (for checkDiffTargetPaths) */
export const DIFF_ALLOWED_PREFIXES = [
  `${DIR_CURSOR}/${SUBDIR_SKILLS}/`,
  `${DIR_CLAUDE}/${SUBDIR_SKILLS}/`,
  `${DIR_CURSOR}/${SUBDIR_RULES}/`,
  `${DIR_CLAUDE}/${SUBDIR_RULES}/`,
] as const;
