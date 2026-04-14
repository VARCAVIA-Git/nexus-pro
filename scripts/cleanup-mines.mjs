import 'dotenv/config';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const h = { Authorization: `Bearer ${token}` };

async function smembers(key) {
  const r = await fetch(`${url}/smembers/${encodeURIComponent(key)}`, { headers: h });
  return (await r.json()).result ?? [];
}
async function del(key) {
  await fetch(`${url}/del/${encodeURIComponent(key)}`, { headers: h });
}
async function srem(key, val) {
  await fetch(`${url}/srem/${encodeURIComponent(key)}/${encodeURIComponent(val)}`, { headers: h });
}

const statuses = ['waiting', 'pending', 'open', 'closing'];
let cleaned = 0;

for (const s of statuses) {
  const ids = await smembers(`nexus:mines:status:${s}`);
  for (const id of ids) {
    await del(`nexus:mine:${id}`);
    await srem(`nexus:mines:status:${s}`, id);
    cleaned++;
    console.log(`  Cleaned: ${id} (${s})`);
  }
}

// Clean active sets per symbol
for (const sym of ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD']) {
  const ids = await smembers(`nexus:mines:active:${sym}`);
  for (const id of ids) {
    await srem(`nexus:mines:active:${sym}`, id);
  }
}

console.log(`\nTotal cleaned: ${cleaned} mines`);
console.log('Mine state reset complete.');
