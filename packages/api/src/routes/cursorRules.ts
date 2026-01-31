/**
 * Cursor rules router - POST /sync, POST /, PUT /:index, DELETE /:index
 */

import { Router, Request, Response } from 'express';
import { CursorRulesService, CursorUserRule } from '../services/cursorRulesService';

export function createCursorRulesRouter(): Router {
  const router = Router();

  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const rules: CursorUserRule[] = req.body.rules || [];
      if (!Array.isArray(rules)) {
        return res.status(400).json({ success: false, error: 'Invalid request: rules must be an array' });
      }
      const rulesService = new CursorRulesService();
      const result = await rulesService.exportUserRules(rules);
      if (result.success) {
        res.json({ success: true, data: { exported: result.exported, filePath: result.filePath } });
      } else {
        res.status(500).json({ success: false, error: result.error || 'Failed to export user rules' });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[API] Failed to sync cursor rules:', errorMsg);
      res.status(500).json({ success: false, error: errorMsg });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { content, description } = req.body || {};
      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ success: false, error: 'content is required' });
      }
      const rulesService = new CursorRulesService();
      const existing = await rulesService.readExportedRules();
      const rules: CursorUserRule[] = Array.isArray(existing) ? existing : [];
      rules.push({ content: content.trim(), description: description?.trim() || undefined });
      const result = await rulesService.exportUserRules(rules);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      res.status(201).json({
        success: true,
        data: { index: rules.length - 1, name: `cursor-user-rule-${rules.length - 1}`, exported: result.exported },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMsg });
    }
  });

  router.put('/:index', async (req: Request, res: Response) => {
    try {
      const index = parseInt(req.params.index, 10);
      const { content, description } = req.body || {};
      if (Number.isNaN(index) || index < 0) {
        return res.status(400).json({ success: false, error: 'invalid index' });
      }
      const rulesService = new CursorRulesService();
      const existing = await rulesService.readExportedRules();
      if (!existing || index >= existing.length) {
        return res.status(404).json({ success: false, error: 'User rule not found' });
      }
      const rules = [...existing];
      rules[index] = {
        content: typeof content === 'string' ? content.trim() : rules[index].content,
        description: description !== undefined ? (description?.trim() || undefined) : rules[index].description,
      };
      const result = await rulesService.exportUserRules(rules);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      res.json({ success: true, data: { index, name: `cursor-user-rule-${index}`, exported: result.exported } });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMsg });
    }
  });

  router.delete('/:index', async (req: Request, res: Response) => {
    try {
      const index = parseInt(req.params.index, 10);
      if (Number.isNaN(index) || index < 0) {
        return res.status(400).json({ success: false, error: 'invalid index' });
      }
      const rulesService = new CursorRulesService();
      const existing = await rulesService.readExportedRules();
      if (!existing || index >= existing.length) {
        return res.status(404).json({ success: false, error: 'User rule not found' });
      }
      const rules = existing.filter((_, i) => i !== index);
      const result = await rulesService.exportUserRules(rules);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }
      res.json({ success: true, data: { deleted: index, remaining: rules.length } });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: errorMsg });
    }
  });

  return router;
}
