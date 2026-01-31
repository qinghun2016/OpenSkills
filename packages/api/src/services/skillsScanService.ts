/**
 * Skills and Rules directory scanning service
 * Extracted from index for separation of concerns
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { DIR_CURSOR, DIR_CLAUDE, SUBDIR_SKILLS, SUBDIR_RULES, SKILL_ENTRY_FILE } from '../constants/paths';
import { CursorRulesService } from './cursorRulesService';

export interface SkillListItem {
  name: string;
  scope: 'user' | 'project';
  path: string;
  description?: string;
  lastModified: string;
  type?: 'skill' | 'rule';
}

export function shouldExcludeFile(filePath: string, fileName: string): boolean {
  const lowerPath = filePath.toLowerCase();
  const lowerName = fileName.toLowerCase();
  const excludePathPatterns = [
    '/planes/', '\\planes\\', '/plans/', '\\plans\\',
    '/cache/', '\\cache\\', '/changelog', '\\changelog',
  ];
  if (excludePathPatterns.some(p => lowerPath.includes(p))) return true;
  const excludeFilePatterns = [
    'changelog', 'readme', 'license', 'plane', 'planes', 'plans', 'cache',
    '.git', 'node_modules', '.vscode', '.idea', 'package.json', 'package-lock.json',
    'yarn.lock', 'pnpm-lock.yaml', '.plan',
  ];
  return excludeFilePatterns.some(p => lowerName.includes(p));
}

export function shouldExcludeDirectory(dirName: string): boolean {
  const lowerName = dirName.toLowerCase();
  const excludePatterns = [
    'cache', 'node_modules', '.git', '.vscode', '.idea', 'dist', 'build',
    'tmp', 'temp', 'logs', 'plane', 'planes', 'plans', 'agent',
  ];
  return excludePatterns.some(p => lowerName === p || lowerName.includes(p));
}

function parseDescriptionFromFrontmatter(fileContent: string): string | undefined {
  const m = fileContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return undefined;
  const descMatch = m[1].match(/description:\s*(.+)/);
  return descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

export async function scanSkillsDirectory(
  dirPath: string,
  scope: 'user' | 'project',
  skills: SkillListItem[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dirPath, entry.name, SKILL_ENTRY_FILE);
        let description: string | undefined;
        let lastModified = new Date().toISOString();
        try {
          const fileContent = await fs.readFile(skillPath, 'utf-8');
          const stats = await fs.stat(skillPath);
          lastModified = stats.mtime.toISOString();
          description = parseDescriptionFromFrontmatter(fileContent);
        } catch {
          // 文件不存在，使用默认值
        }
        skills.push({
          name: entry.name,
          scope,
          path: skillPath,
          description,
          lastModified,
          type: 'skill',
        });
      }
    }
  } catch {
    // 目录不存在，忽略
  }
}

export async function scanRulesDirectory(
  dirPath: string,
  scope: 'user' | 'project',
  skills: SkillListItem[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.mdc') || entry.name.endsWith('.md'))) {
        const rulePath = path.join(dirPath, entry.name);
        if (shouldExcludeFile(rulePath, entry.name)) continue;
        if (entry.name.endsWith('.md')) {
          try {
            await fs.stat(path.join(dirPath, entry.name.replace(/\.md$/, '.mdc')));
            continue;
          } catch {
            // .mdc 不存在，使用 .md
          }
        }
        if (scope === 'user' && (entry.name === 'cursor-user-rules.mdc' || entry.name === 'cursor-user-rules.md')) continue;
        let description: string | undefined;
        let lastModified = new Date().toISOString();
        try {
          const fileContent = await fs.readFile(rulePath, 'utf-8');
          const stats = await fs.stat(rulePath);
          lastModified = stats.mtime.toISOString();
          description = parseDescriptionFromFrontmatter(fileContent);
        } catch {
          // ignore
        }
        const nameWithoutExt = entry.name.replace(/\.mdc$/, '').replace(/\.md$/, '');
        skills.push({
          name: nameWithoutExt,
          scope,
          path: rulePath,
          description: description || `规则文件: ${entry.name}`,
          lastModified,
          type: 'rule',
        });
      } else if (entry.isDirectory()) {
        // Skip skills, rules (handled separately), and agent (Cursor internal, not OpenSkills rules)
        if (entry.name === 'skills' || entry.name === 'rules' || entry.name === 'agent') continue;
        if (shouldExcludeDirectory(entry.name)) continue;
        const ruleDirPath = path.join(dirPath, entry.name);
        try {
          const ruleFiles = await fs.readdir(ruleDirPath, { withFileTypes: true });
          for (const ruleFile of ruleFiles) {
            if (ruleFile.isFile() && (ruleFile.name.endsWith('.mdc') || ruleFile.name.endsWith('.md'))) {
              const rulePath = path.join(ruleDirPath, ruleFile.name);
              if (shouldExcludeFile(rulePath, ruleFile.name)) continue;
              if (ruleFile.name.endsWith('.md')) {
                try {
                  await fs.stat(path.join(ruleDirPath, ruleFile.name.replace(/\.md$/, '.mdc')));
                  continue;
                } catch {
                  // ok
                }
              }
              let description: string | undefined;
              let lastModified = new Date().toISOString();
              try {
                const fileContent = await fs.readFile(rulePath, 'utf-8');
                const stats = await fs.stat(rulePath);
                lastModified = stats.mtime.toISOString();
                description = parseDescriptionFromFrontmatter(fileContent);
              } catch {
                // ignore
              }
              const nameWithoutExt = ruleFile.name.replace(/\.mdc$/, '').replace(/\.md$/, '');
              skills.push({
                name: `${entry.name}/${nameWithoutExt}`,
                scope,
                path: rulePath,
                description: description || `规则: ${entry.name}/${ruleFile.name}`,
                lastModified,
                type: 'rule',
              });
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // 目录不存在，忽略
  }
}

const TOP_LEVEL_RULE_NAMES = ['AGENTS', 'RULE', 'RULES'];

async function addTopLevelRules(
  workspaceRoot: string,
  scope: 'user' | 'project',
  skills: SkillListItem[]
): Promise<void> {
  const home = process.env.HOME || homedir();
  const cursorBase = scope === 'project'
    ? path.join(workspaceRoot, DIR_CURSOR)
    : path.join(home, DIR_CURSOR);
  const claudeBase = scope === 'project'
    ? path.join(workspaceRoot, DIR_CLAUDE)
    : path.join(home, DIR_CLAUDE);
  for (const ruleName of TOP_LEVEL_RULE_NAMES) {
    const pathsToCheck = [
      path.join(cursorBase, `${ruleName}.mdc`),
      path.join(cursorBase, `${ruleName}.md`),
      path.join(claudeBase, `${ruleName}.mdc`),
      path.join(claudeBase, `${ruleName}.md`),
    ];
    let rulePath: string | null = null;
    let mtime = new Date().toISOString();
    for (const p of pathsToCheck) {
      try {
        const stats = await fs.stat(p);
        rulePath = p;
        mtime = stats.mtime.toISOString();
        break;
      } catch {
        // continue
      }
    }
    if (rulePath) {
      let description: string | undefined;
      try {
        const fileContent = await fs.readFile(rulePath, 'utf-8');
        description = parseDescriptionFromFrontmatter(fileContent);
      } catch {
        // ignore
      }
      skills.push({
        name: ruleName,
        scope,
        path: rulePath,
        description: description || `顶级规则文件: ${ruleName}`,
        lastModified: mtime,
        type: 'rule',
      });
    }
  }
}

async function addCursorUserRules(skills: SkillListItem[]): Promise<void> {
  const rulesService = new CursorRulesService();
  const exportedRules = await rulesService.readExportedRules();
  if (!exportedRules || exportedRules.length === 0) return;
  let lastModified = new Date().toISOString();
  try {
    const stats = await fs.stat(rulesService.getExportedRulesFilePath());
    lastModified = stats.mtime.toISOString();
  } catch {
    // ignore
  }
  const LIST_DESC_MAX = 80;
  for (let i = 0; i < exportedRules.length; i++) {
    const r = exportedRules[i];
    const rawDesc = r.description || r.content.trim().slice(0, 80);
    const desc = rawDesc.length > LIST_DESC_MAX ? rawDesc.slice(0, LIST_DESC_MAX).trim() + '…' : rawDesc;
    skills.push({
      name: `cursor-user-rule-${i}`,
      scope: 'user',
      path: '~/.cursor/rules/cursor-user-rules.mdc',
      description: desc,
      lastModified,
      type: 'rule',
    });
  }
}

export async function listAllSkills(workspaceRoot: string): Promise<SkillListItem[]> {
  const skills: SkillListItem[] = [];
  const pathMod = path;

  // Project
  await scanSkillsDirectory(pathMod.join(workspaceRoot, DIR_CURSOR, SUBDIR_SKILLS), 'project', skills);
  await scanSkillsDirectory(pathMod.join(workspaceRoot, DIR_CLAUDE, SUBDIR_SKILLS), 'project', skills);
  await scanRulesDirectory(pathMod.join(workspaceRoot, DIR_CURSOR, SUBDIR_RULES), 'project', skills);
  await scanRulesDirectory(pathMod.join(workspaceRoot, DIR_CLAUDE, SUBDIR_RULES), 'project', skills);
  await scanRulesDirectory(pathMod.join(workspaceRoot, DIR_CURSOR), 'project', skills);
  await scanRulesDirectory(pathMod.join(workspaceRoot, DIR_CLAUDE), 'project', skills);
  await addTopLevelRules(workspaceRoot, 'project', skills);

  // User
  const userHome = process.env.HOME || homedir();
  const userCursorSkills = process.env.USER_SKILLS_DIR || pathMod.join(userHome, DIR_CURSOR, SUBDIR_SKILLS);
  const userClaudeSkills = process.env.USER_CLAUDE_SKILLS_DIR || pathMod.join(userHome, DIR_CLAUDE, SUBDIR_SKILLS);
  await scanSkillsDirectory(userCursorSkills, 'user', skills);
  await scanSkillsDirectory(userClaudeSkills, 'user', skills);
  const userCursorRules = pathMod.join(userHome, DIR_CURSOR, SUBDIR_RULES);
  const userClaudeRules = pathMod.join(userHome, DIR_CLAUDE, SUBDIR_RULES);
  await scanRulesDirectory(userCursorRules, 'user', skills);
  await scanRulesDirectory(userClaudeRules, 'user', skills);
  const userCursorBase = pathMod.join(userHome, DIR_CURSOR);
  const userClaudeBase = pathMod.join(userHome, DIR_CLAUDE);
  await scanRulesDirectory(userCursorBase, 'user', skills);
  await scanRulesDirectory(userClaudeBase, 'user', skills);
  await addCursorUserRules(skills);
  await addTopLevelRules(workspaceRoot, 'user', skills);

  const skillMap = new Map<string, SkillListItem>();
  for (const skill of skills) {
    const key = `${skill.scope}-${skill.name}`;
    const existing = skillMap.get(key);
    if (!existing || new Date(skill.lastModified) > new Date(existing.lastModified)) {
      skillMap.set(key, skill);
    }
  }
  return Array.from(skillMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
