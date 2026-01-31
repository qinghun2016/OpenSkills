import { Router, Request, Response } from 'express';
import { ConfigService } from '../services/configService';
import { Config, ConfigSchema, ApiResponse, MergedResult } from '../types';

/**
 * 创建 Config 路由
 */
export function createConfigRouter(projectRoot: string): Router {
  const router = Router();
  const configService = new ConfigService(projectRoot);

  /**
   * GET /api/config
   * 获取配置（合并用户级 + 项目级）
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const result = await configService.getMergedConfig();
      const response: ApiResponse<MergedResult<Config>> = {
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

  const ALLOWED_CONFIG_KEYS = new Set([
    'adminMode', 'skillsAdminSkillRef', 'proposalValidity', 'crawl', 'wake', 'handoff', 'merge', 'agentAutoPropose', 'reward'
  ]);

  function filterConfigUpdates(body: unknown): Partial<Config> {
    if (!body || typeof body !== 'object') return {};
    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_CONFIG_KEYS.has(key)) {
        updates[key] = (body as Record<string, unknown>)[key];
      }
    }
    return updates as Partial<Config>;
  }

  /**
   * PUT /api/config
   * 更新配置（写入项目级 .openskills/config.json）
   */
  router.put('/', async (req: Request, res: Response) => {
    try {
      const updates = filterConfigUpdates(req.body);
      
      if (!updates || Object.keys(updates).length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No updates provided'
        };
        return res.status(400).json(response);
      }

      const newConfig = await configService.updateConfig(updates);
      const response: ApiResponse<Config> = {
        success: true,
        data: newConfig
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
   * PATCH /api/config
   * 部分更新配置（写入项目级 .openskills/config.json）
   * 返回合并后的 config（与 GET 一致），便于前端立即更新缓存并消除「有未保存的更改」。
   */
  router.patch('/', async (req: Request, res: Response) => {
    try {
      const updates = filterConfigUpdates(req.body);
      
      if (!updates || Object.keys(updates).length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No updates provided'
        };
        return res.status(400).json(response);
      }

      await configService.updateConfig(updates);
      const { merged } = await configService.getMergedConfig();
      const response: ApiResponse<Config> = {
        success: true,
        data: merged
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
   * GET /api/config/schema
   * 返回 config 结构说明
   */
  router.get('/schema', (_req: Request, res: Response) => {
    try {
      const schema = configService.getConfigSchema();
      const response: ApiResponse<ConfigSchema> = {
        success: true,
        data: schema
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
