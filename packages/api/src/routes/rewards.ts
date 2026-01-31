/**
 * Rewards Router
 * Handles /api/rewards endpoints for agent reward system
 */

import { Router, Request, Response } from 'express';
import * as agentRewardService from '../services/agentRewardService';
import { ApiResponse } from '../types';

const router = Router();

/**
 * GET /api/rewards/stats
 * Get agent statistics
 * Query params: agentName (optional)
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const agentName = req.query.agentName as string | undefined;
    const stats = await agentRewardService.getAgentStats(agentName);
    
    res.json({
      success: true,
      data: stats,
    } as ApiResponse<typeof stats>);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/rewards/leaderboard
 * Get agent leaderboard
 * Query params: limit (default: 10)
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaderboard = await agentRewardService.getAgentLeaderboard(limit);
    
    res.json({
      success: true,
      data: leaderboard,
      total: leaderboard.length,
    } as ApiResponse<typeof leaderboard>);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/rewards/history
 * Get reward history
 * Query params: agentName (optional), limit (default: 50)
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const agentName = req.query.agentName as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await agentRewardService.getRewardHistory(agentName, limit);
    
    res.json({
      success: true,
      data: history,
      total: history.length,
    } as ApiResponse<typeof history>);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    } as ApiResponse<null>);
  }
});

export default router;
