import { Router, Request, Response } from 'express';
import { PreferencesService } from '../services/preferencesService';
import { Preferences, ApiResponse, MergedResult, PreferencesHistoryEntry } from '../types';

/**
 * 创建 Preferences 路由
 */
export function createPreferencesRouter(projectRoot: string): Router {
  const router = Router();
  const preferencesService = new PreferencesService(projectRoot);

  /**
   * GET /api/preferences
   * 获取当前偏好（合并用户级 + 项目级，项目级优先）
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const result = await preferencesService.getMergedPreferences();
      const response: ApiResponse<MergedResult<Preferences>> = {
        success: true,
        data: result
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(response);
    }
  });

  /**
   * PUT /api/preferences
   * 更新偏好（写入项目级 .openskills/preferences.json）
   */
  router.put('/', async (req: Request, res: Response) => {
    try {
      const updates: Partial<Preferences> = req.body;
      
      if (!updates || Object.keys(updates).length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No updates provided'
        };
        return res.status(400).json(response);
      }

      const historyEntry = await preferencesService.updatePreferences(updates);
      const response: ApiResponse<PreferencesHistoryEntry> = {
        success: true,
        data: historyEntry
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(response);
    }
  });

  /**
   * PATCH /api/preferences
   * 部分更新偏好（写入项目级 .openskills/preferences.json）
   */
  router.patch('/', async (req: Request, res: Response) => {
    try {
      const updates: Partial<Preferences> = req.body;
      
      if (!updates || Object.keys(updates).length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No updates provided'
        };
        return res.status(400).json(response);
      }

      const historyEntry = await preferencesService.updatePreferences(updates);
      const response: ApiResponse<PreferencesHistoryEntry> = {
        success: true,
        data: historyEntry
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(response);
    }
  });

  /**
   * GET /api/preferences/history
   * 偏好变更历史
   */
  router.get('/history', async (_req: Request, res: Response) => {
    try {
      const history = await preferencesService.getHistory();
      const response: ApiResponse<PreferencesHistoryEntry[]> = {
        success: true,
        data: history
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(response);
    }
  });

  /**
   * GET /api/preferences/history/:historyId
   * 获取指定历史记录详情
   */
  router.get('/history/:historyId', async (req: Request, res: Response) => {
    try {
      const { historyId } = req.params;
      const entry = await preferencesService.getHistoryEntry(historyId);
      
      if (!entry) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'History entry not found'
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse<PreferencesHistoryEntry> = {
        success: true,
        data: entry
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/preferences/rollback/:historyId
   * 回滚到指定历史版本
   */
  router.post('/rollback/:historyId', async (req: Request, res: Response) => {
    try {
      const { historyId } = req.params;
      const rollbackEntry = await preferencesService.rollback(historyId);
      
      const response: ApiResponse<PreferencesHistoryEntry> = {
        success: true,
        data: rollbackEntry
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(response);
    }
  });

  return router;
}
