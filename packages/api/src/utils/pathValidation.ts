/**
 * Path validation utilities for OpenSkills API
 * Prevents path traversal and enforces safe skill/rule names
 */

import * as path from 'path';

/** Safe character set: alphanumeric, hyphen, underscore, single-level dir like foo/bar */
const SAFE_NAME_REGEX = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*$/;

/**
 * Sanitize skill or rule name: allow only safe characters, reject .. and absolute paths
 * @returns Sanitized name or null if invalid
 */
export function sanitizeSkillName(name: string): string | null {
  if (typeof name !== 'string' || !name.length) {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  // Reject path traversal and control chars
  if (trimmed.includes('..') || path.isAbsolute(trimmed)) {
    return null;
  }
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return null;
  }
  if (!SAFE_NAME_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Check that a resolved path is within the workspace root (no path escape)
 */
export function isPathWithinWorkspace(resolvedPath: string, workspaceRoot: string): boolean {
  const normalizedResolved = path.normalize(path.resolve(resolvedPath));
  const normalizedRoot = path.normalize(path.resolve(workspaceRoot));
  return normalizedResolved === normalizedRoot || normalizedResolved.startsWith(normalizedRoot + path.sep);
}
