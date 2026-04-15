#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// NexusOne — Cron Worker
//
// Fast tick (30s): NexusOne signal/execution + live prices
// Slow tick (60s): legacy infra (analytic queue, news)
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
 * Fast tick (every 30s): NexusOne signal/execution + live prices.
 */
function fastTick() {
  tickCounter++;
  // NexusOne: signal evaluation + execution + monitoring
  callTick('/api/nexusone/tick', 'nexusone');
  // Live prices for dashboard
  callTick('/api/cron/live-observer-tick', 'live');
}

/**
 * Slow tick (every 60s): infrastructure only.
 * Discovery/retrain DISABLED per NexusOne manual.
 */
function slowTick() {
  // Legacy bot tick (kept for monitoring, no discovery)
  callTick('/api/cron/tick', 'tick');
  // News (passive context only)
  callTick('/api/cron/news-tick', 'news');
  // NOTE: analytic-tick and auto-retrain-tick DISABLED
  // They are discovery-driven and not part of NexusOne live path
}

console.log('═══════════════════════════════════════');
console.log('NexusOne — Cron Worker');
console.log(`Fast tick: 30s on :${PORT}`);
console.log('  - /api/nexusone/tick             (signal + execution)');
console.log('  - /api/cron/live-observer-tick    (prices)');
console.log(`Slow tick: 60s on :${PORT}`);
console.log('  - /api/cron/tick                  (legacy bot monitor)');
console.log('  - /api/cron/news-tick             (passive context)');
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
