/**
 * routes/scheduler.ts - 调度器 API 端点
 * 提供调度器状态查询和手动触发接口
 */
import { Router, Request, Response } from 'express';
import {
  getSchedulerInstances,
  getSchedulerStatus,
} from '../scheduler';
import type { HandoffSnapshot } from '../scheduler/handoffMonitor';

const router = Router();

/**
 * GET /api/scheduler/status
 * 获取所有调度任务的状态
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = getSchedulerStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/wake/trigger
 * 手动触发唤醒
 */
router.post('/wake/trigger', async (_req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const result = await instances.wake.triggerManually();
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scheduler/wake/history
 * 获取唤醒历史
 */
router.get('/wake/history', async (req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const history = await instances.wake.getHistory(limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/handoff/trigger
 * 手动触发交接
 */
router.post('/handoff/trigger', (req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const reason = (req.body?.reason as string) || 'Manual trigger via API';
    const result = instances.handoff.triggerManually(reason);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/handoff/estimate
 * 更新上下文 token 估算（供插件/Web 上报）
 */
router.post('/handoff/estimate', (req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const { estimatedTokens, source } = req.body;

    if (typeof estimatedTokens !== 'number' || estimatedTokens < 0) {
      res.status(400).json({
        success: false,
        error: 'estimatedTokens must be a non-negative number',
      });
      return;
    }

    instances.handoff.updateContextEstimate(estimatedTokens, source || 'api');

    res.json({
      success: true,
      message: 'Context estimate updated',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/scheduler/handoff/trigger
 * 清除交接触发信号（交接完成后调用）
 */
router.delete('/handoff/trigger', (_req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    instances.handoff.clearTrigger();

    res.json({
      success: true,
      message: 'Handoff trigger cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scheduler/handoff/snapshot
 * 获取交接快照（新 Agent 启动时调用，从断点继续）
 */
router.get('/handoff/snapshot', (_req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const snapshot = instances.handoff.readSnapshot();

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/handoff/snapshot
 * 保存交接快照（Agent 在 token 接近上限、压缩上下文时调用，禁止直接写 handoff/latest.json）
 */
router.post('/handoff/snapshot', (req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const body = req.body as Partial<HandoffSnapshot>;
    if (!body || !Array.isArray(body.pendingProposals) || typeof body.summary !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: pendingProposals (array), summary (string). Optional: inProgressDecision, timestamp, touchedFiles, decisionsMade',
      });
      return;
    }

    const snapshot: HandoffSnapshot = {
      pendingProposals: body.pendingProposals,
      summary: body.summary,
      timestamp: body.timestamp || new Date().toISOString(),
    };
    if (body.inProgressDecision) {
      snapshot.inProgressDecision = body.inProgressDecision;
    }
    if (Array.isArray(body.touchedFiles)) {
      snapshot.touchedFiles = body.touchedFiles;
    }
    if (Array.isArray(body.decisionsMade)) {
      snapshot.decisionsMade = body.decisionsMade;
    }

    instances.handoff.saveSnapshot(snapshot);

    res.json({
      success: true,
      message: 'Handoff snapshot saved',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/crawl/trigger
 * 手动触发爬取
 */
router.post('/crawl/trigger', async (_req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const result = await instances.crawl.triggerManually();
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/merge/trigger
 * 手动触发合并
 */
router.post('/merge/trigger', async (_req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const result = await instances.merge.triggerManually();
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scheduler/merge/status
 * 获取合并状态
 */
router.get('/merge/status', (_req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const status = instances.merge.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scheduler/merge/history
 * 获取合并历史
 */
router.get('/merge/history', (req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const history = instances.merge.getHistory(limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
