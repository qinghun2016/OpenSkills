/**
 * Diff safety checks for OpenSkills API
 * Shared dangerous-pattern and path checks used by proposalService and diffService
 */

import { DIR_CURSOR, DIR_CLAUDE, DIFF_ALLOWED_PREFIXES } from '../constants/paths';

export const DANGEROUS_DIFF_PATTERNS = [
  /eval\s*\(/i,
  /exec\s*\(/i,
  /system\s*\(/i,
  /subprocess\.call/i,
  /\.\.\//,
  /\.\.\\/,
];

export interface DiffSafetyResult {
  safe: boolean;
  reason?: string;
}

/**
 * Check diff content for dangerous patterns (path traversal, code execution, etc.)
 * Used both before auto-approve (proposalService) and before apply (diffService).
 */
export function checkDiffSafety(diffString: string): DiffSafetyResult {
  if (typeof diffString !== 'string' || !diffString.length) {
    return { safe: false, reason: 'Diff 内容为空' };
  }
  for (const pattern of DANGEROUS_DIFF_PATTERNS) {
    if (pattern.test(diffString)) {
      return { safe: false, reason: '检测到潜在安全风险' };
    }
  }
  return { safe: true };
}

/**
 * Check that diff targets only allowed paths (e.g. skills/rules under .cursor or .claude)
 */
export function checkDiffTargetPaths(diffString: string): DiffSafetyResult {
  if (!diffString.includes(`${DIR_CURSOR}/`) && !diffString.includes(`${DIR_CLAUDE}/`)) {
    return { safe: false, reason: '提议修改了非 Skills/Rules 文件' };
  }
  const hasAllowed = DIFF_ALLOWED_PREFIXES.some(p => diffString.includes(p));
  if (!hasAllowed) {
    return { safe: false, reason: '提议修改了非 Skills 文件' };
  }
  return { safe: true };
}
