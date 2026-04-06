#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Cron Worker
// Calls /api/cron/tick every 60 seconds via HTTP
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const PORT = process.env.PORT || 3000;

function tick() {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);

  http.get(`http://localhost:${PORT}/api/cron/tick`, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const d = JSON.parse(data);
        console.log(`[${ts}] Tick: ${res.statusCode} | Processed: ${d.processed ?? 0} | Elapsed: ${d.elapsed ?? 0}ms`);
        if (d.results) {
          for (const r of d.results) {
            console.log(`  ${r.ticked ? '✅' : '❌'} ${r.name}: ${r.signals ?? 0} signals ${r.error ? `— ${r.error}` : ''}`);
          }
        }
      } catch {
        console.log(`[${ts}] Tick: ${res.statusCode}`);
      }
    });
  }).on('error', (err) => {
    console.error(`[${ts}] Tick error: ${err.message}`);
  });
}

console.log('═══════════════════════════════════════');
console.log('NEXUS PRO — Cron Worker');
console.log(`Ticking http://localhost:${PORT}/api/cron/tick every 60s`);
console.log('═══════════════════════════════════════');
console.log('');

// First tick after 5s (wait for web server to start)
setTimeout(tick, 5000);

// Then every 60 seconds
setInterval(tick, 60000);
