import 'dotenv/config';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const h = { Authorization: `Bearer ${token}` };

async function get(key) {
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: h });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}
async function raw(key) {
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: h });
  const d = await r.json();
  return d.result;
}
async function smembers(key) {
  const r = await fetch(`${url}/smembers/${encodeURIComponent(key)}`, { headers: h });
  const d = await r.json();
  return d.result ?? [];
}
async function lrange(key) {
  const r = await fetch(`${url}/lrange/${encodeURIComponent(key)}/0/-1`, { headers: h });
  const d = await r.json();
  return d.result ?? [];
}

console.log('=== SYSTEM HEALTH CHECK ===\n');

// 1. Tracked assets
const tracked = await smembers('nexus:analytic:list');
console.log('Tracked assets:', tracked.length > 0 ? tracked.join(', ') : 'NONE');

// 2. Asset states
for (const sym of tracked) {
  const state = await get(`nexus:analytic:${sym}`);
  const report = await get(`nexus:analytic:report:${sym}`);
  const live = await get(`nexus:analytic:live:${sym}`);
  console.log(`\n  ${sym}:`);
  console.log(`    status=${state?.status ?? 'N/A'} regime=${state?.currentRegime ?? '—'}`);
  console.log(`    report=${report ? 'YES' : 'NO'} v2=${report?.distributionProfile ? report.distributionProfile.conditionDistributions?.length + ' setups' : 'NO'}`);
  console.log(`    live=${live ? 'YES price=' + live.price : 'NO'}`);
}

// 3. Queue and lock
const queue = await lrange('nexus:analytic:queue');
const lockExists = await fetch(`${url}/exists/nexus%3Aanalytic%3Alock`, { headers: h }).then(r => r.json());
console.log('\nQueue:', queue.length > 0 ? queue.join(', ') : 'empty');
console.log('Lock:', lockExists.result ? 'ACTIVE (training in progress)' : 'clear');

// 4. Mines
const mineStatuses = ['waiting', 'pending', 'open', 'closing'];
let totalMines = 0;
for (const s of mineStatuses) {
  const ids = await smembers(`nexus:mines:status:${s}`);
  if (ids.length > 0) {
    console.log(`\n${s} mines: ${ids.length}`);
    for (const id of ids.slice(0, 3)) {
      const m = await get(`nexus:mine:${id}`);
      if (m) console.log(`  ${id}: ${m.symbol} ${m.direction} entry:${m.entryPrice} pnl:${(m.unrealizedPnl || 0).toFixed(2)}`);
    }
    totalMines += ids.length;
  }
}
if (totalMines === 0) console.log('\nMines: NONE');

// 5. Engine + Portfolio
const engine = await raw('nexus:mine-engine:enabled');
const snap = await get('nexus:portfolio:snapshot');
console.log('\nMine Engine:', engine === 'true' ? 'ENABLED' : 'DISABLED');
if (snap) console.log(`Portfolio: equity=$${snap.equity} mines=${snap.minesCount} pnl=$${(snap.totalUnrealizedPnl || 0).toFixed(2)}`);

// 6. Cron check
const lastTick = await raw('nexus:mine-engine:last-tick');
if (lastTick) {
  const ago = Math.round((Date.now() - Number(lastTick)) / 1000);
  console.log(`Last mine tick: ${ago}s ago ${ago > 120 ? '⚠️ STALE' : '✓'}`);
}

// 7. Live prices
try {
  const btc = await fetch('http://localhost:3000/api/prices/symbol?symbol=BTC%2FUSD').then(r => r.json());
  console.log(`\nAlpaca BTC price: $${btc?.price ?? 'N/A'}`);
} catch { console.log('\nPrice API: unreachable'); }

console.log('\n=== CHECK COMPLETE ===');
