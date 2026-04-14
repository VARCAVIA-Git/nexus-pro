import 'dotenv/config';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const h = { Authorization: `Bearer ${token}` };

const symbols = process.argv.slice(2);
if (symbols.length === 0) { console.log('Usage: node scripts/retrain.mjs BTC/USD ETH/USD'); process.exit(1); }

for (const sym of symbols) {
  const key = `nexus:analytic:${sym}`;
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: h });
  const d = await r.json();
  if (!d.result) { console.log(`${sym}: no state found`); continue; }
  const state = JSON.parse(d.result);
  state.status = 'queued';
  state.nextScheduledRefresh = Date.now() - 1000;
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(state))}`, { headers: h });
  await fetch(`${url}/lpush/nexus%3Aanalytic%3Aqueue/${encodeURIComponent(sym)}`, { headers: h });
  await fetch(`${url}/del/${encodeURIComponent(`nexus:analytic:job:${sym}`)}`, { headers: h });
  console.log(`${sym}: queued for retrain`);
}
await fetch(`${url}/del/nexus%3Aanalytic%3Alock`, { headers: h });
console.log('Lock cleared');
