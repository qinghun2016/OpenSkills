/**
 * History Router
 * Handles /api/history endpoints
 */

import { Router, Request, Response } from 'express';
import * as historyService from '../services/historyService';
import * as diffService from '../services/diffService';
import { HistoryQueryParams } from '../types';

const router = Router();

/**
 * GET /api/history
 * List history entries
 * Query params: limit, skillName
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params: HistoryQueryParams = {};

    if (req.query.limit) {
      params.limit = parseInt(req.query.limit as string, 10);
    }
    if (req.query.skillName) {
      params.skillName = req.query.skillName as string;
    }
    if (req.query.search) {
      params.search = req.query.search as string;
    }

    const result = await historyService.listHistoryEntries(params);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/history/:id
 * Get a single history entry
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await historyService.getHistoryEntry(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'History entry not found',
      });
    }

    res.json({
      success: true,
      data: entry,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/history/:id/rollback
 * Rollback to a specific history entry
 */
router.post('/:id/rollback', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { useBackup } = req.query;

    // Check if entry exists
    const entry = await historyService.getHistoryEntry(id);
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'History entry not found',
      });
    }

    // Check if rollback is possible
    const canRollback = await historyService.canRollback(id);
    if (!canRollback.canRollback) {
      return res.status(400).json({
        success: false,
        error: canRollback.reason,
      });
    }

    let result;

    // Use backup file or revert diff
    if (useBackup === 'true') {
      result = await diffService.restoreFromBackup(entry.skillPath, id);
    } else {
      result = await diffService.revertDiff(entry.skillPath, entry.diff);
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    // Mark entry as rolled back
    await historyService.markAsRolledBack(id);

    res.json({
      success: true,
      message: 'Rollback successful',
      data: {
        historyId: id,
        restoredContent: result.restoredContent,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/history/:id/can-rollback
 * Check if a history entry can be rolled back
 */
router.get('/:id/can-rollback', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await historyService.canRollback(id);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/history/proposal/:proposalId
 * Get history entries for a specific proposal
 */
router.get('/proposal/:proposalId', async (req: Request, res: Response) => {
  try {
    const { proposalId } = req.params;

    const entries = await historyService.getHistoryByProposalId(proposalId);
    res.json({
      success: true,
      data: entries,
      total: entries.length,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/history/stats
 * Get history statistics
 */
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const stats = await historyService.getHistoryStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
