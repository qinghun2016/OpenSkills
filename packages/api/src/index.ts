/**
 * OpenSkills API Server
 * Express entry point for proposals/decisions/history/scheduler CRUD
 */
import path from 'path';
import { config as loadDotenv } from 'dotenv';
// Load .env from monorepo root
const root = process.cwd().includes(path.sep + 'packages' + path.sep)
  ? path.resolve(process.cwd(), '../..')
  : process.cwd();
loadDotenv({ path: path.join(root, '.env') });
if (process.env.OPENSKILLS_PROCESS_NAME) {
  process.title = process.env.OPENSKILLS_PROCESS_NAME;
}

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as fs from 'fs';

// Routes
import proposalsRouter from './routes/proposals';
import decisionsRouter from './routes/decisions';
import historyRouter from './routes/history';
import crawlerRouter from './routes/crawler';
import schedulerRouter from './routes/scheduler';
import rewardsRouter from './routes/rewards';
import { createConfigRouter } from './routes/config';
import { createPreferencesRouter } from './routes/preferences';
import { createSkillsRouter } from './routes/skills';
import { createCursorRulesRouter } from './routes/cursorRules';

// Scheduler
import { initScheduler, stopScheduler, getSchedulerInstances } from './scheduler';
import { getWorkspaceRoot, getOpenskillsPath, loadSchedulerConfig } from './config/schedulerConfig';

// Utils
import { initDirectories } from './utils/fileUtils';
import { preloadSchemas } from './utils/schemaValidator';

// Configuration: default 3000 for npm run dev; extension uses 3847. Set PORT=3847 if you need API on 3847.
const PORT = process.env.PORT || 3000;
// 0.0.0.0 = listen on all interfaces (localhost, LAN, etc.)
const HOST = process.env.HOST || '0.0.0.0';

// Create Express app
const app: Express = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://localhost:3847', 'http://127.0.0.1:3000', 'http://127.0.0.1:3847'],
}));

/** Robust JSON parser: handles double-encoded or malformed body (e.g. ""{\r\n  "key": from Agent tools) */
function parseJsonBody(raw: Buffer, limit: number): unknown {
  const str = raw.toString('utf8').trim();
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    // Fallback: extract inner JSON when body looks like ""{...}" or "{...}" with leading junk
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    const start =
      firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)
        ? firstBrace
        : firstBracket >= 0
          ? firstBracket
          : -1;
    if (start >= 0) {
      const end = str[start] === '{' ? str.lastIndexOf('}') : str.lastIndexOf(']');
      if (end >= start) {
        try {
          return JSON.parse(str.slice(start, end + 1));
        } catch {
          /* ignore */
        }
      }
    }
    // If first parse gave a string that looks like JSON, try parsing that (double-wrap)
    try {
      const inner = JSON.parse(str);
      if (typeof inner === 'string' && (inner.startsWith('{') || inner.startsWith('['))) {
        return JSON.parse(inner);
      }
    } catch {
      /* ignore */
    }
    throw new SyntaxError(`Unexpected token '"', "${str.slice(0, 50)}..." is not valid JSON`);
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return next();
  }
  const limit = 2 * 1024 * 1024; // 2mb
  const chunks: Buffer[] = [];
  let len = 0;
  req.on('data', (chunk: Buffer) => {
    len += chunk.length;
    if (len > limit) {
      req.removeAllListeners('data');
      req.removeAllListeners('end');
      res.status(413).json({ success: false, error: 'Payload too large' });
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks);
      (req as Request & { body: unknown }).body = raw.length ? parseJsonBody(raw, limit) : {};
      next();
    } catch (err) {
      next(err);
    }
  });
});
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoints (both /health and /api/health for flexibility)
const healthCheckHandler = (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
};

app.get('/health', healthCheckHandler);
app.get('/api/health', healthCheckHandler);

// API Routes
app.use('/api/proposals', proposalsRouter);
app.use('/api/decisions', decisionsRouter);
app.use('/api/history', historyRouter);
app.use('/api/crawler', crawlerRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/rewards', rewardsRouter);

// ?????? projectRoot ???
const workspaceRoot = getWorkspaceRoot();
app.use('/api/config', createConfigRouter(workspaceRoot));
app.use('/api/preferences', createPreferencesRouter(workspaceRoot));
app.use('/api/skills', createSkillsRouter(workspaceRoot));
app.use('/api/cursor-rules', createCursorRulesRouter());

// Admin ????
app.get('/api/admin/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      isOnline: true,
      lastActivity: new Date().toISOString(),
    },
  });
});

app.get('/api/admin/wake-history', async (_req: Request, res: Response) => {
  try {
    const instances = getSchedulerInstances();
    if (!instances) {
      res.status(503).json({
        success: false,
        error: 'Scheduler not initialized',
      });
      return;
    }
    const limit = parseInt(_req.query.limit as string) || 100;
    const records = await instances.wake.getHistory(limit);
    const history = records.map((record) => ({
      id: record.timestamp,
      triggeredAt: record.timestamp,
      trigger: 'scheduled' as const,
      result: (record.triggered ? 'success' : 'failed') as 'success' | 'failed',
      proposalsProcessed: record.pendingCount || 0,
    }));
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API info endpoint
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    success: true,
    name: 'OpenSkills API',
    version: '0.1.0',
    endpoints: {
      proposals: {
        'GET /api/proposals': 'List proposals (query: status, scope, limit, summary)',
        'GET /api/proposals/:id': 'Get proposal by ID',
        'POST /api/proposals': 'Create proposal',
        'PATCH /api/proposals/:id': 'Update proposal status',
        'DELETE /api/proposals/:id': 'Delete proposal',
      },
      decisions: {
        'GET /api/decisions': 'List decisions (query: limit)',
        'GET /api/decisions/:proposalId': 'Get decision by proposal ID',
        'POST /api/decisions': 'Create decision',
        'POST /api/decisions/:proposalId/apply': 'Apply approved decision to SKILL.md',
        'GET /api/decisions/:proposalId/validate': 'Validate diff can be applied',
        'GET /api/decisions/:proposalId/preview': 'Preview applied result',
      },
      history: {
        'GET /api/history': 'List history entries (query: limit, skillName)',
        'GET /api/history/:id': 'Get history entry by ID',
        'POST /api/history/:id/rollback': 'Rollback to specific version',
        'GET /api/history/:id/can-rollback': 'Check if rollback is possible',
        'GET /api/history/proposal/:proposalId': 'Get history by proposal ID',
      },
      crawler: {
        'GET /api/crawler/runs': 'List crawl run records',
        'GET /api/crawler/runs/:runId': 'Get run details',
        'GET /api/crawler/repos': 'List cached repos',
        'POST /api/crawler/trigger': 'Trigger a crawl manually',
        'GET /api/crawler/status': 'Get crawler status',
      },
      scheduler: {
        'GET /api/scheduler/status': 'Get all scheduler status',
        'POST /api/scheduler/wake/trigger': 'Manually trigger wake',
        'GET /api/scheduler/wake/history': 'Get wake history',
        'POST /api/scheduler/handoff/trigger': 'Manually trigger handoff',
        'POST /api/scheduler/handoff/estimate': 'Update context token estimate',
        'DELETE /api/scheduler/handoff/trigger': 'Clear handoff trigger',
        'GET /api/scheduler/handoff/snapshot': 'Get handoff snapshot (for new Agent to continue)',
        'POST /api/scheduler/handoff/snapshot': 'Save handoff snapshot (Agent context compression)',
        'POST /api/scheduler/crawl/trigger': 'Manually trigger crawl',
      },
      cursorRules: {
        'POST /api/cursor-rules/sync': 'Sync Cursor global user rules to file system',
      },
    },
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Error handler: body-parser JSON ???????/??????? 400??? 500
app.use((err: Error & { type?: string; status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode;
  if (err.type === 'entity.parse.failed' || (status === 400 && err.message?.includes('JSON'))) {
    console.error('[API] JSON parse error:', err.message);
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body. Ensure the body is valid UTF-8 JSON (e.g. use Content-Type: application/json; charset=utf-8).',
    });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Initialize and start server
async function start(): Promise<void> {
  try {
    // Initialize required directories
    console.log('Initializing directories...');
    await initDirectories();

    // Preload schemas for faster validation
    console.log('Preloading schemas...');
    await preloadSchemas();

    // Initialize scheduler
    console.log('Initializing scheduler...');
    // #region agent log
    const debugLog = async (location: string, message: string, data: any, hypothesisId: string) => {
      try {
        const workspaceRoot = getWorkspaceRoot();
        const logPath = path.join(workspaceRoot, '.cursor', 'debug.log');
        // ??????
        if (!fs.existsSync(path.dirname(logPath))) {
          fs.mkdirSync(path.dirname(logPath), { recursive: true });
        }
        const logEntry = JSON.stringify({location,message,data,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId}) + '\n';
        fs.appendFileSync(logPath, logEntry, 'utf-8');
      } catch (err) {
        console.error('[DebugLog] Failed to write log:', err);
      }
    };
    debugLog('index.ts:707', 'Loading scheduler config', {openskillsPath:getOpenskillsPath(),workspaceRoot:getWorkspaceRoot()}, 'A').catch(()=>{});
    // #endregion
    const schedulerConfig = loadSchedulerConfig();
    // #region agent log
    debugLog('index.ts:709', 'Scheduler config loaded', {configExists:schedulerConfig!==null,crawlEnabled:schedulerConfig?.crawl?.enabled,crawlSchedule:schedulerConfig?.crawl?.schedule}, 'A').catch(()=>{});
    // #endregion
    if (schedulerConfig) {
      // #region agent log
      debugLog('index.ts:710', 'Calling initScheduler', {crawlEnabled:schedulerConfig.crawl.enabled,crawlSchedule:schedulerConfig.crawl.schedule}, 'A').catch(()=>{});
      // #endregion
      initScheduler(schedulerConfig);
      // #region agent log
      const instances = getSchedulerInstances();
      debugLog('index.ts:711', 'After initScheduler', {instancesExist:instances!==null,crawlStatus:instances?.crawl.getStatus()}, 'A,D').catch(()=>{});
      // #endregion
      console.log('Scheduler initialized successfully');
    } else {
      console.warn('Running without scheduler (config not found)');
    }

    // Start server
    app.listen(Number(PORT), HOST, () => {
      console.log('');
      console.log('??????????????????????????????????????????');
      console.log('?       OpenSkills API Server            ?');
      console.log('??????????????????????????????????????????');
      console.log(`?  URL: http://${HOST}:${PORT}              ?`);
      console.log('?  API: /api                             ?');
      console.log('??????????????????????????????????????????');
      console.log('');
      console.log('Endpoints:');
      console.log('  - GET  /api/proposals');
      console.log('  - GET  /api/decisions');
      console.log('  - GET  /api/history');
      console.log('  - GET  /api/crawler');
      console.log('  - GET  /api/scheduler');
      console.log('  - GET  /api/health');
      console.log('');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[API] Shutting down...');
  stopScheduler();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[API] Shutting down...');
  stopScheduler();
  process.exit(0);
});

// Start the server
start();

// Export for testing
export default app;
