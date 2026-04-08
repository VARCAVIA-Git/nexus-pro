#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Cron Worker
// Calls /api/cron/tick every 60 seconds via HTTP
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
          console.log(`[${ts}] Live: ${res.statusCode} | symbol=${d.symbol ?? '-'} regime=${d.regime ?? '-'} momentum=${d.momentumScore ?? '-'} active=${d.activeRules ?? 0}${d.skipped ? ' [skipped: ' + d.skipped + ']' : ''}`);
        } else if (label === 'news') {
          console.log(`[${ts}] News: ${res.statusCode} | symbol=${d.symbol ?? '-'} count=${d.count ?? 0} sent=${d.avgSentiment ?? '-'} delta=${d.delta ?? '-'}${d.skipped ? ' [skipped: ' + d.skipped + ']' : ''}`);
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

function tick() {
  tickCounter++;
  const now = Math.floor(Date.now() / 1000);

  // Sequenziali ma asincroni: ogni route ha il suo timeout interno
  callTick('/api/cron/tick', 'tick');
  callTick('/api/cron/analytic-tick', 'analytic');
  // Live observer: ogni tick (1 symbol round-robin)
  callTick('/api/cron/live-observer-tick', 'live');
  // News: ogni 30 min (1800s) con finestra di 60s
  if (now % 1800 < 60) {
    callTick('/api/cron/news-tick', 'news');
  }
  // Auto-retrain: ogni 1h (3600s) con finestra di 60s
  if (now % 3600 < 60) {
    callTick('/api/cron/auto-retrain-tick', 'auto-retrain');
  }
}

console.log('═══════════════════════════════════════');
console.log('NEXUS PRO — Cron Worker');
console.log(`Ticking 5 endpoints every 60s on :${PORT}`);
console.log('  - /api/cron/tick                  (legacy bot)');
console.log('  - /api/cron/analytic-tick         (queue worker)');
console.log('  - /api/cron/live-observer-tick    (1/tick round-robin)');
console.log('  - /api/cron/news-tick             (every 30 min)');
console.log('  - /api/cron/auto-retrain-tick     (every 1 h)');
console.log('═══════════════════════════════════════');
console.log('');

// First tick after 5s (wait for web server to start)
setTimeout(tick, 5000);

// Then every 60 seconds
setInterval(tick, 60000);
