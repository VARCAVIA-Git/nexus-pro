#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Cron Worker (Phase 6)
//
// Two tick cycles:
//   - Fast tick (30s): live observer + mine engine (continuous AI)
//   - Slow tick (60s): bot tick, analytic, news, auto-retrain
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const PORT = process.env.PORT || 3000;

function callTick(path, label) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const opts = {
    host: 'localhost',
    port: PORT,
    path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (process.env.CRON_SECRET) {
    opts.headers['x-cron-secret'] = process.env.CRON_SECRET;
  }

  const req = http.request(opts, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const d = JSON.parse(data);
        if (label === 'tick') {
          console.log(`[${ts}] Tick: ${res.statusCode} | Processed: ${d.processed ?? 0} | Elapsed: ${d.elapsed ?? 0}ms`);
          if (d.results) {
            for (const r of d.results) {
              console.log(`  ${r.ticked ? '✅' : '❌'} ${r.name}: ${r.signals ?? 0} signals ${r.error ? `— ${r.error}` : ''}`);
            }
          }
        } else if (label === 'analytic') {
          console.log(`[${ts}] Analytic: ${res.statusCode} | observed=${d.observed ?? 0} processed=${d.processed ? 'yes' : 'no'} ${d.errors && d.errors.length ? '| errors=' + d.errors.join(';') : ''}`);
        } else if (label === 'live') {
          const results = d.results ?? [];
          const summary = results.map(r => r.symbol ? `${r.symbol}:${r.regime ?? '?'}` : '').filter(Boolean).join(' ');
          console.log(`[${ts}] Live: ${res.statusCode} | ${d.processed ?? 0} symbols ${summary}${d.skipped ? ' [skipped: ' + d.skipped + ']' : ''} ${d.elapsedMs ?? 0}ms`);
        } else if (label === 'news') {
          console.log(`[${ts}] News: ${res.statusCode} | symbol=${d.symbol ?? '-'} count=${d.count ?? 0} sent=${d.avgSentiment ?? '-'} delta=${d.delta ?? '-'}${d.skipped ? ' [skipped: ' + d.skipped + ']' : ''}`);
        } else if (label === 'mine') {
          const p6 = d.waitingMines != null ? ` waiting=${d.waitingMines} filled=${d.limitOrdersFilled ?? 0} expired=${d.limitOrdersExpired ?? 0} evals=${d.evaluations ?? 0}` : '';
          console.log(`[${ts}] Mine: ${res.statusCode} | enabled=${d.enabled ?? false} aic=${d.aicOnline ? 'ON' : 'off'}${d.regime ? ' regime=' + d.regime : ''} monitored=${d.monitored ?? 0} signals=${d.signalsDetected ?? 0} actions=${d.actionsExecuted ?? 0}${p6} ${d.elapsedMs ?? 0}ms${d.skipped ? ' [skipped: ' + d.skipped + ']' : ''}${d.errors?.length ? ' errors=' + d.errors.join(';') : ''}`);
        } else if (label === 'auto-retrain') {
          console.log(`[${ts}] AutoRetrain: ${res.statusCode} | scheduled=${d.scheduled?.scheduled ?? 'none'} reason=${d.scheduled?.reason ?? '-'} incr=${d.incrementalResult ? (d.incrementalResult.skipped ? 'skipped:'+d.incrementalResult.reason : 'done:'+d.incrementalResult.symbol) : 'none'}${d.skipped ? ' [skipped: ' + d.skipped + ']' : ''}`);
        } else {
          console.log(`[${ts}] ${label}: ${res.statusCode}`);
        }
      } catch {
        console.log(`[${ts}] ${label}: ${res.statusCode}`);
      }
    });
  });
  req.on('error', (err) => {
    console.error(`[${ts}] ${label} error: ${err.message}`);
  });
  req.end();
}

let tickCounter = 0;

/**
 * Fast tick (every 30s): live observer + mine engine.
 * These are the Phase 6 continuous AI components.
 */
function fastTick() {
  tickCounter++;
  // Live observer: all symbols in parallel
  callTick('/api/cron/live-observer-tick', 'live');
  // Mine engine: continuous evaluator + limit order monitoring
  callTick('/api/cron/mine-tick', 'mine');
}

/**
 * Slow tick (every 60s): bot tick, analytic queue, news, auto-retrain.
 * These are heavier operations that don't need 30s cadence.
 */
function slowTick() {
  const now = Math.floor(Date.now() / 1000);

  callTick('/api/cron/tick', 'tick');
  callTick('/api/cron/analytic-tick', 'analytic');
  callTick('/api/cron/news-tick', 'news');

  // Auto-retrain: every 1h (3600s) with 60s window
  if (now % 3600 < 60) {
    callTick('/api/cron/auto-retrain-tick', 'auto-retrain');
  }
}

console.log('═══════════════════════════════════════');
console.log('NEXUS PRO — Cron Worker (Phase 6)');
console.log(`Fast tick: 30s on :${PORT} (live observer + mine engine)`);
console.log(`Slow tick: 60s on :${PORT} (bot, analytic, news, retrain)`);
console.log('  Fast:');
console.log('  - /api/cron/live-observer-tick    (all symbols, 30s)');
console.log('  - /api/cron/mine-tick             (evaluator + mines, 30s)');
console.log('  Slow:');
console.log('  - /api/cron/tick                  (legacy bot, 60s)');
console.log('  - /api/cron/analytic-tick         (queue worker, 60s)');
console.log('  - /api/cron/news-tick             (1 symbol round-robin, 60s)');
console.log('  - /api/cron/auto-retrain-tick     (every 1h)');
console.log('═══════════════════════════════════════');
console.log('');

// First fast tick after 5s (wait for web server to start)
setTimeout(fastTick, 5000);
// First slow tick after 10s
setTimeout(slowTick, 10000);

// Fast tick every 30 seconds
setInterval(fastTick, 30000);
// Slow tick every 60 seconds
setInterval(slowTick, 60000);
