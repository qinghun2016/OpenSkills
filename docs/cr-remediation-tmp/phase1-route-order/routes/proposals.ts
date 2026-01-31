/**
 * Proposals Router
 * Handles /api/proposals endpoints
 */

import { Router, Request, Response } from 'express';
import * as proposalService from '../services/proposalService';
import * as decisionService from '../services/decisionService';
import {
  ProposalCreateInput,
  ProposalUpdateInput,
  ProposalQueryParams,
  ProposalScope,
  ProposalStatus,
  ProposalTrigger,
} from '../types';

const router = Router();

/**
 * GET /api/proposals
 * List proposals with optional filters
 * Query params: status, scope, limit, summary
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params: ProposalQueryParams = {};

    // Parse query parameters
    if (req.query.status) {
      params.status = req.query.status as ProposalStatus;
    }
    if (req.query.scope) {
      params.scope = req.query.scope as ProposalScope;
    }
    if (req.query.trigger) {
      params.trigger = req.query.trigger as ProposalTrigger;
    }
    if (req.query.limit) {
      params.limit = parseInt(req.query.limit as string, 10);
    }
    if (req.query.summary === 'true') {
      params.summary = true;
    }

    const result = await proposalService.listProposals(params);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/proposals/pending/count
 * Get count of pending proposals
 * Must be registered before GET /:id to avoid matching "pending" as id.
 */
router.get('/pending/count', async (_req: Request, res: Response) => {
  try {
    const count = await proposalService.getPendingCount();
    res.json({
      success: true,
      data: { count },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/proposals/:id
 * Get a single proposal by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await proposalService.getProposal(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/proposals
 * Create a new proposal
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const input: ProposalCreateInput = req.body;

    // Basic validation
    if (!input.skillName || !input.scope || !input.reason || !input.diff) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: skillName, scope, reason, diff',
      });
    }

    // Validate scope
    if (!['user', 'project'].includes(input.scope)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid scope. Must be "user" or "project"',
      });
    }

    // Validate trigger and proposerMeta (required by service and schema)
    if (!input.trigger || !['human', 'agent', 'crawler'].includes(input.trigger)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid trigger. Must be "human", "agent", or "crawler"',
      });
    }
    if (!input.proposerMeta || typeof input.proposerMeta !== 'object' || !input.proposerMeta.source) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid proposerMeta.source (required)',
      });
    }

    const result = await proposalService.createProposal(input);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[Proposals] POST /api/proposals failed:', message, stack || '');
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      ...(process.env.NODE_ENV !== 'production' && { detail: message }),
    });
  }
});

/**
 * POST /api/proposals/:id/approve
 * Approve a proposal (creates decision via decisionService, decidedBy: human)
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id: proposalId } = req.params;
    const body = req.body as { reason?: string };
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const result = await decisionService.createDecision({
      proposalId,
      decision: 'approve',
      reason: reason || '批准',
      decidedBy: 'human',
    });
    if (!result.success) {
      return res.status(result.error === 'Proposal not found' ? 404 : 400).json(result);
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/proposals/:id/reject
 * Reject a proposal (creates decision via decisionService, decidedBy: human)
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id: proposalId } = req.params;
    const body = req.body as { reason?: string };
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: reason',
      });
    }
    const result = await decisionService.createDecision({
      proposalId,
      decision: 'reject',
      reason,
      decidedBy: 'human',
    });
    if (!result.success) {
      return res.status(result.error === 'Proposal not found' ? 404 : 400).json(result);
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * PATCH /api/proposals/:id
 * Update a proposal (mainly status)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates: ProposalUpdateInput = req.body;

    // Validate status if provided
    if (updates.status && !['pending', 'approved', 'rejected'].includes(updates.status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be "pending", "approved", or "rejected"',
      });
    }

    const result = await proposalService.updateProposal(id, updates);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/proposals/:id
 * Delete a proposal
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await proposalService.deleteProposal(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
