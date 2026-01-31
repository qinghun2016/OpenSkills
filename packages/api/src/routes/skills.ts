/**
 * Skills router - GET /api/skills and GET /api/skills/:scope/:name
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { homedir } from 'os';
import { DIR_CURSOR, DIR_CLAUDE, SUBDIR_SKILLS, SUBDIR_RULES, SKILL_ENTRY_FILE } from '../constants/paths';
import { listAllSkills } from '../services/skillsScanService';
import { CursorRulesService } from '../services/cursorRulesService';
import { sanitizeSkillName, isPathWithinWorkspace } from '../utils/pathValidation';

export function createSkillsRouter(workspaceRoot: string): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const uniqueSkills = await listAllSkills(workspaceRoot);
      res.json({ success: true, data: uniqueSkills });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to list skills' });
    }
  });

  router.get('/:scope/:name', async (req: Request, res: Response) => {
    try {
      const { scope, name } = req.params;
      if (scope !== 'user' && scope !== 'project') {
        return res.status(400).json({ success: false, error: 'Invalid scope' });
      }
      const safeName = sanitizeSkillName(name);
      if (safeName === null) {
        return res.status(400).json({ success: false, error: 'Invalid name' });
      }

      const userRuleMatch = scope === 'user' && /^cursor-user-rule-(\d+)$/.exec(safeName);
      if (userRuleMatch) {
        const index = parseInt(userRuleMatch[1], 10);
        const rulesService = new CursorRulesService();
        const rules = await rulesService.readExportedRules();
        if (!rules || index < 0 || index >= rules.length) {
          return res.status(404).json({ success: false, error: 'User rule not found' });
        }
        const rule = rules[index];
        const rulesFilePath = rulesService.getExportedRulesFilePath();
        let lastModified = new Date().toISOString();
        try {
          const stats = await fs.stat(rulesFilePath);
          lastModified = stats.mtime.toISOString();
        } catch {
          // ignore
        }
        return res.json({
          success: true,
          data: {
            name,
            scope: 'user',
            path: '~/.cursor/rules/cursor-user-rules.mdc',
            description: rule.description || rule.content.trim().slice(0, 80),
            lastModified,
            content: rule.content.trim(),
            type: 'rule',
          },
        });
      }

      const possiblePaths: string[] = [];
      if (scope === 'project') {
        possiblePaths.push(
          path.join(workspaceRoot, DIR_CURSOR, SUBDIR_SKILLS, safeName, SKILL_ENTRY_FILE),
          path.join(workspaceRoot, DIR_CLAUDE, SUBDIR_SKILLS, safeName, SKILL_ENTRY_FILE)
        );
        if (safeName.includes('/')) {
          const [dir, file] = safeName.split('/');
          possiblePaths.push(
            path.join(workspaceRoot, DIR_CURSOR, SUBDIR_RULES, dir, `${file}.mdc`),
            path.join(workspaceRoot, DIR_CLAUDE, SUBDIR_RULES, dir, `${file}.mdc`),
            path.join(workspaceRoot, DIR_CURSOR, SUBDIR_RULES, dir, `${file}.md`),
            path.join(workspaceRoot, DIR_CLAUDE, SUBDIR_RULES, dir, `${file}.md`)
          );
        } else {
          possiblePaths.push(
            path.join(workspaceRoot, DIR_CURSOR, SUBDIR_RULES, `${safeName}.mdc`),
            path.join(workspaceRoot, DIR_CLAUDE, SUBDIR_RULES, `${safeName}.mdc`),
            path.join(workspaceRoot, DIR_CURSOR, SUBDIR_RULES, `${safeName}.md`),
            path.join(workspaceRoot, DIR_CLAUDE, SUBDIR_RULES, `${safeName}.md`),
            path.join(workspaceRoot, DIR_CURSOR, `${safeName}.mdc`),
            path.join(workspaceRoot, DIR_CLAUDE, `${safeName}.mdc`),
            path.join(workspaceRoot, DIR_CURSOR, `${safeName}.md`),
            path.join(workspaceRoot, DIR_CLAUDE, `${safeName}.md`)
          );
        }
      } else {
        const userHome = process.env.HOME || homedir();
        const userCursorBase = process.env.USER_SKILLS_DIR?.replace(`/${SUBDIR_SKILLS}`, '') || path.join(userHome, DIR_CURSOR);
        const userClaudeBase = process.env.USER_CLAUDE_SKILLS_DIR?.replace(`/${SUBDIR_SKILLS}`, '') || path.join(userHome, DIR_CLAUDE);
        possiblePaths.push(
          path.join(userCursorBase, SUBDIR_SKILLS, safeName, SKILL_ENTRY_FILE),
          path.join(userClaudeBase, SUBDIR_SKILLS, safeName, SKILL_ENTRY_FILE)
        );
        if (safeName.includes('/')) {
          const [dir, file] = safeName.split('/');
          possiblePaths.push(
            path.join(userCursorBase, SUBDIR_RULES, dir, `${file}.mdc`),
            path.join(userClaudeBase, SUBDIR_RULES, dir, `${file}.mdc`),
            path.join(userCursorBase, SUBDIR_RULES, dir, `${file}.md`),
            path.join(userClaudeBase, SUBDIR_RULES, dir, `${file}.md`)
          );
        } else {
          possiblePaths.push(
            path.join(userCursorBase, SUBDIR_RULES, `${safeName}.mdc`),
            path.join(userClaudeBase, SUBDIR_RULES, `${safeName}.mdc`),
            path.join(userCursorBase, SUBDIR_RULES, `${safeName}.md`),
            path.join(userClaudeBase, SUBDIR_RULES, `${safeName}.md`),
            path.join(userCursorBase, `${safeName}.mdc`),
            path.join(userClaudeBase, `${safeName}.mdc`),
            path.join(userCursorBase, `${safeName}.md`),
            path.join(userClaudeBase, `${safeName}.md`)
          );
        }
      }

      let skillPath: string | null = null;
      for (const testPath of possiblePaths) {
        try {
          await fs.access(testPath);
          skillPath = testPath;
          break;
        } catch {
          // continue
        }
      }
      if (!skillPath) {
        return res.status(404).json({ success: false, error: 'Skill file not found' });
      }
      if (scope === 'project') {
        const resolved = path.resolve(skillPath);
        if (!isPathWithinWorkspace(resolved, workspaceRoot)) {
          return res.status(400).json({ success: false, error: 'Path outside workspace' });
        }
      }

      let content = '';
      let description: string | undefined;
      let lastModified = new Date().toISOString();
      const isRule = skillPath.includes('/rules/') || skillPath.includes('\\rules\\') ||
        ((skillPath.endsWith('.mdc') || skillPath.endsWith('.md')) && !skillPath.includes('/skills/') && !skillPath.includes('\\skills\\'));
      const type: 'skill' | 'rule' = isRule ? 'rule' : 'skill';
      try {
        content = await fs.readFile(skillPath, 'utf-8');
        const stats = await fs.stat(skillPath);
        lastModified = stats.mtime.toISOString();
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
        if (frontmatterMatch) {
          const yamlContent = frontmatterMatch[1];
          const descMatch = yamlContent.match(/description:\s*(.+)/);
          if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');
        }
      } catch {
        return res.status(500).json({ success: false, error: 'Failed to read skill file' });
      }

      let displayPath = skillPath;
      const userHomeForDisplay = process.env.USERPROFILE || process.env.HOME || homedir();
      if (userHomeForDisplay && skillPath.startsWith(userHomeForDisplay)) {
        displayPath = skillPath.replace(userHomeForDisplay, '~').replace(/\\/g, '/');
      }

      res.json({
        success: true,
        data: {
          name,
          scope: scope as 'user' | 'project',
          path: displayPath,
          description: description || undefined,
          lastModified,
          content,
          type,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to get skill' });
    }
  });

  return router;
}
