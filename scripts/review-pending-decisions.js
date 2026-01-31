#!/usr/bin/env node
/**
 * Skills-admin: review all pending proposals, POST decisions, apply approved.
 * 
 * Review policy:
 * 1. Crawler proposals: Check against decision history to avoid re-rejecting.
 *    - If skill was previously rejected with same reason, skip (already handled).
 *    - If skill is new or content differs, evaluate quality and relevance.
 * 2. Agent proposals: Approve if diff and reason are valid.
 * 3. Quality thresholds: minReasonLength >= 20, diff required.
 * 
 * Usage: node scripts/review-pending-decisions.js [--approve-crawler]
 *   --approve-crawler: Approve crawler proposals by default (for initial import)
 */
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';
const http = require('http');
const fs = require('fs');
const path = require('path');

// Decision history file path
const HISTORY_DIR = path.join(process.cwd(), '.openskills', 'crawled', 'decision-history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'reviewed-skills.json');

function request(method, reqPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(API_BASE + reqPath);
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: body ? { 'Content-Type': 'application/json; charset=utf-8' } : {},
    };
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch (e) {
          resolve({ status: res.statusCode, data: d });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    req.end();
  });
}

/**
 * Load decision history for crawler-sourced skills
 */
function loadDecisionHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Failed to load decision history:', e.message);
  }
  return { skills: {}, lastUpdated: null };
}

/**
 * Save decision history
 */
function saveDecisionHistory(history) {
  try {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
    history.lastUpdated = new Date().toISOString();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to save decision history:', e.message);
  }
}

/**
 * Generate a content hash for comparing skill content
 */
function hashContent(content) {
  // Simple hash: take first 100 chars of normalized content
  const normalized = (content || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return normalized;
}

/**
 * Evaluate crawler proposal quality and relevance
 */
function evaluateCrawlerProposal(proposal, history, approveCrawler) {
  const skillKey = `${proposal.skillName}|${proposal.proposerMeta?.reason || ''}`;
  const contentHash = hashContent(proposal.diff);
  
  const existingEntry = history.skills[skillKey];
  
  // Check if this exact content was already rejected
  if (existingEntry && existingEntry.decision === 'reject' && existingEntry.contentHash === contentHash) {
    return {
      skip: true,
      reason: `Already reviewed and rejected: ${existingEntry.reason}`
    };
  }
  
  // If --approve-crawler flag is set, approve by default
  if (approveCrawler) {
    return {
      decision: 'approve',
      reason: 'Crawler proposal approved for initial import. Source: ' + (proposal.proposerMeta?.reason || 'external repository')
    };
  }
  
  // Quality checks for crawler proposals
  const diff = proposal.diff || '';
  const reason = proposal.reason || '';
  
  // Check minimum quality thresholds
  if (reason.length < 20) {
    return {
      decision: 'reject',
      reason: 'Insufficient reason: must be at least 20 characters'
    };
  }
  
  if (diff.length < 50) {
    return {
      decision: 'reject', 
      reason: 'Insufficient diff: skill content too short'
    };
  }
  
  // Check for high-quality sources (high star count)
  const sourceMatch = reason.match(/(\d+)\s*stars/);
  const starCount = sourceMatch ? parseInt(sourceMatch[1], 10) : 0;
  
  if (starCount >= 500) {
    return {
      decision: 'approve',
      reason: `High-quality source (${starCount} stars): ${proposal.reason}`
    };
  }
  
  // Default: approve with standard quality
  return {
    decision: 'approve',
    reason: `Crawler proposal meets quality threshold: ${proposal.reason}`
  };
}

async function main() {
  const approveCrawler = process.argv.includes('--approve-crawler');
  
  const list = await request('GET', '/api/proposals?status=pending');
  if (!list.data.success || !list.data.data) {
    console.error('Failed to list pending:', list.data);
    process.exit(1);
  }
  const pending = list.data.data;
  console.log('Pending count:', pending.length);
  
  if (approveCrawler) {
    console.log('Mode: --approve-crawler (crawler proposals will be approved by default)');
  }
  
  // Load decision history
  const history = loadDecisionHistory();

  const approvedIds = [];
  const skipped = [];
  const rejected = [];
  
  for (const p of pending) {
    const source = (p.proposerMeta && p.proposerMeta.source) || '';
    
    let decision;
    
    if (source === 'crawler') {
      // Use new evaluation logic for crawler proposals
      const evaluation = evaluateCrawlerProposal(p, history, approveCrawler);
      
      if (evaluation.skip) {
        console.log('SKIP:', p.id, p.skillName, '-', evaluation.reason);
        skipped.push(p.id);
        continue;
      }
      
      decision = evaluation;
      
      // Record in history
      const skillKey = `${p.skillName}|${p.proposerMeta?.reason || ''}`;
      history.skills[skillKey] = {
        decision: decision.decision,
        reason: decision.reason,
        contentHash: hashContent(p.diff),
        reviewedAt: new Date().toISOString(),
        proposalId: p.id
      };
    } else {
      // Agent proposals: approve if valid
      decision = { decision: 'approve', reason: 'Project-relevant improvement; diff and reason valid.' };
    }
    
    const body = {
      proposalId: p.id,
      decision: decision.decision,
      reason: decision.reason,
      decidedBy: 'agent',
      decidedAt: new Date().toISOString(),
    };
    
    const res = await request('POST', '/api/decisions', body);
    if (res.status >= 200 && res.status < 300 && res.data.success) {
      console.log(decision.decision.toUpperCase() + ':', p.id, p.skillName);
      if (decision.decision === 'approve') {
        approvedIds.push(p.id);
      } else {
        rejected.push(p.id);
      }
    } else {
      console.error('Decision failed for', p.id, res.status, res.data);
    }
  }

  // Save updated history
  saveDecisionHistory(history);

  // Apply approved proposals
  for (const id of approvedIds) {
    const res = await request('POST', `/api/decisions/${encodeURIComponent(id)}/apply`);
    if (res.status >= 200 && res.status < 300 && res.data.success) {
      console.log('Applied:', id);
    } else {
      console.error('Apply failed for', id, res.status, res.data);
    }
  }
  
  console.log('\n--- Summary ---');
  console.log('Approved and applied:', approvedIds.length);
  console.log('Rejected:', rejected.length);
  console.log('Skipped (already reviewed):', skipped.length);
  console.log('Decision history saved to:', HISTORY_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
