// ═══════════════════════════════════════════════════════════════
// Multi-asset history cache — fetch once, reuse many.
//
// 6 assets × 2 timeframes (1H, 4H) × 2 years from OKX history-candles.
// Writes to scripts/research/cache/<symbol>_<tf>.json
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD'];
const TFS: Array<{ tf: '1H' | '4H'; days: number }> = [
  { tf: '1H', days: 730 },
  { tf: '4H', days: 730 },
];
const OKX_BASE = 'https://www.okx.com/api/v5';
const CACHE_DIR = path.join(__dirname, 'cache');

interface Bar {
  ts: number; open: number; high: number; low: number; close: number; volume: number;
}

function toOkx(s: string): string {
  return ({
    'BTC-USD': 'BTC-USDT-SWAP', 'ETH-USD': 'ETH-USDT-SWAP', 'SOL-USD': 'SOL-USDT-SWAP',
    'BNB-USD': 'BNB-USDT-SWAP', 'XRP-USD': 'XRP-USDT-SWAP', 'ADA-USD': 'ADA-USDT-SWAP',
  } as Record<string, string>)[s] ?? s;
}

function targetBars(tf: string, days: number): number {
  const perDay = tf === '1H' ? 24 : tf === '4H' ? 6 : 24 * 12;
  return days * perDay;
}

async function fetchAll(symbol: string, tf: '1H' | '4H', target: number): Promise<Bar[]> {
  const inst = toOkx(symbol);
  const out: Bar[] = [];
  let after: string | undefined;
  let safety = 400;

  while (out.length < target && safety-- > 0) {
    const url = new URL(`${OKX_BASE}/market/history-candles`);
    url.searchParams.set('instId', inst);
    url.searchParams.set('bar', tf);
    url.searchParams.set('limit', '300');
    if (after) url.searchParams.set('after', after);

    let res: Response;
    try { res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } }); }
    catch (e: any) { console.error(`net err ${e.message}`); await new Promise(r => setTimeout(r, 500)); continue; }
    if (!res.ok) { console.error(`HTTP ${res.status} for ${inst} ${tf}`); break; }

    const data = (await res.json()) as { code: string; msg: string; data: string[][] };
    if (data.code !== '0') { console.error(`OKX err ${data.msg}`); break; }
    const batch = data.data ?? [];
    if (batch.length === 0) break;

    for (const c of batch) {
      out.push({
        ts: parseInt(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
        low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]),
      });
    }
    after = batch[batch.length - 1][0];
    process.stdout.write(`\r  ${symbol} ${tf}: ${out.length}/${target} bars   `);
    await new Promise((r) => setTimeout(r, 110));
  }

  const seen = new Set<number>();
  const dedup = out.filter((b) => (seen.has(b.ts) ? false : (seen.add(b.ts), true))).sort((a, b) => a.ts - b.ts);
  console.log(`\n  saved ${dedup.length} unique bars`);
  return dedup;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  for (const symbol of SYMBOLS) {
    for (const { tf, days } of TFS) {
      const file = path.join(CACHE_DIR, `${symbol}_${tf}.json`);
      if (fs.existsSync(file)) {
        const existing = JSON.parse(fs.readFileSync(file, 'utf8')) as Bar[];
        if (existing.length >= targetBars(tf, days) * 0.95) {
          console.log(`✓ ${symbol} ${tf} cached (${existing.length} bars), skip`);
          continue;
        }
      }
      console.log(`\n[fetch] ${symbol} ${tf} (target ~${targetBars(tf, days)} bars)`);
      const bars = await fetchAll(symbol, tf, targetBars(tf, days));
      fs.writeFileSync(file, JSON.stringify(bars));
    }
  }

  console.log('\nCache complete:');
  for (const f of fs.readdirSync(CACHE_DIR)) {
    const stat = fs.statSync(path.join(CACHE_DIR, f));
    console.log(`  ${f.padEnd(20)} ${(stat.size / 1024).toFixed(0)} KB`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
