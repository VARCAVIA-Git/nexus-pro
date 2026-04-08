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
        } else {
          console.log(`[${ts}] Analytic: ${res.statusCode} | observed=${d.observed ?? 0} processed=${d.processed ? 'yes' : 'no'} ${d.errors && d.errors.length ? '| errors=' + d.errors.join(';') : ''}`);
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

function tick() {
  callTick('/api/cron/tick', 'tick');
  callTick('/api/cron/analytic-tick', 'analytic');
}

console.log('═══════════════════════════════════════');
console.log('NEXUS PRO — Cron Worker');
console.log(`Ticking /api/cron/tick + /api/cron/analytic-tick every 60s on :${PORT}`);
console.log('═══════════════════════════════════════');
console.log('');

// First tick after 5s (wait for web server to start)
setTimeout(tick, 5000);

// Then every 60 seconds
setInterval(tick, 60000);
