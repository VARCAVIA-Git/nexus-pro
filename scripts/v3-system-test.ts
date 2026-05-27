// NexusOne v3 — End-to-end smoke test.
//
// Verifies all components work together:
//   1. OKX data fetch
//   2. Indicator precomputation
//   3. Primitive evaluation
//   4. Tuple manager + Bayesian gate
//   5. Orchestrator tick (exits + entries)
//   6. Persistence read/write
//   7. Alpaca paper account reachability
//   8. Alpaca paper order placement (using a tiny notional, immediately cancellable)
//   9. Evaluator script run
//
// Exits with non-zero code on any failure.

import * as dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { fetchOkxBars } from '../src/lib/nexusone/v3/data-fetch';
import { precompute } from '../src/lib/nexusone/v3/indicators';
import { PRIMITIVES_V3 } from '../src/lib/nexusone/v3/primitives';
import { TupleManagerV3, kellyFraction } from '../src/lib/nexusone/v3/tuple-manager';
import {
  tick as orchestratorTick, makeFreshPortfolio, type StreamSnapshot,
} from '../src/lib/nexusone/v3/orchestrator';
import {
  getMode, setMode, loadTuples, saveTuples, loadPortfolio, savePortfolio,
  appendClosedTrades, readClosedTrades, isLiveApproved, getStateDir,
} from '../src/lib/nexusone/v3/persistence';
import { getPaperAccount } from '../src/lib/nexusone/v3/alpaca-paper';
import { ASSETS_V3, TFS_V3, type AssetV3, type TfV3 } from '../src/lib/nexusone/v3/types';

let passed = 0, failed = 0;
const results: { name: string; ok: boolean; detail?: string; ms: number }[] = [];

async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? undefined, ms: Date.now() - t0 });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''} (${Date.now() - t0}ms)`);
    passed++;
  } catch (err: any) {
    results.push({ name, ok: false, detail: err.message, ms: Date.now() - t0 });
    console.error(`✗ ${name} — ${err.message} (${Date.now() - t0}ms)`);
    failed++;
  }
}

async function main() {
  console.log('═══ NexusOne v3 — System Test ═══\n');
  console.log(`State dir: ${getStateDir()}\n`);

  await step('1. OKX data fetch (BTC 1H)', async () => {
    const bars = await fetchOkxBars('BTC-USD', '1H', 250);
    if (bars.length < 240) throw new Error(`only ${bars.length} bars`);
    if (!bars[0].close || !bars[0].ts) throw new Error('malformed bar');
    return `${bars.length} bars, latest=${new Date(bars[bars.length - 1].ts).toISOString()}`;
  });

  let allBars: Record<string, any[]> = {};
  await step('2. OKX data fetch (all 12 streams)', async () => {
    const out: string[] = [];
    for (const a of ASSETS_V3) {
      for (const tf of TFS_V3) {
        const bars = await fetchOkxBars(a, tf, 250);
        if (bars.length < 240) throw new Error(`${a} ${tf}: ${bars.length} bars`);
        allBars[`${a}|${tf}`] = bars;
        out.push(`${a}/${tf}=${bars.length}`);
      }
    }
    return out.join(', ');
  });

  await step('3. Indicator precomputation (BTC 1H)', async () => {
    const bars = allBars['BTC-USD|1H'];
    const ind = precompute(bars);
    const last = bars.length - 1;
    if (!isFinite(ind.rsi14[last])) throw new Error('RSI NaN');
    if (!isFinite(ind.atr14[last])) throw new Error('ATR NaN');
    if (!ind.regime[last]) throw new Error('regime undefined');
    return `regime=${ind.regime[last]} rsi=${ind.rsi14[last].toFixed(1)} atr=${ind.atr14[last].toFixed(2)}`;
  });

  await step('4. Primitive evaluation (all primitives × BTC 1H)', async () => {
    const bars = allBars['BTC-USD|1H'];
    const ind = precompute(bars);
    const last = bars.length - 2;
    const out: string[] = [];
    for (const p of PRIMITIVES_V3) {
      const sig = p.fn(bars, ind, last);
      out.push(`${p.id}=${sig ? sig.dir : 'none'}`);
    }
    return out.join(' ');
  });

  await step('5. Tuple manager + Bayesian gate', async () => {
    const m = new TupleManagerV3();
    const t = m.get('TEST|BTC-USD|1H', 'TEST', 'BTC-USD', '1H');
    if (!t.active) throw new Error('default not active');
    // Push a streak of losses → should deactivate
    for (let i = 0; i < 25; i++) m.update('TEST|BTC-USD|1H', -50);
    const t2 = m.get('TEST|BTC-USD|1H', 'TEST', 'BTC-USD', '1H');
    if (t2.active) throw new Error('did not deactivate after 25 losses');
    // Round-trip serialize / deserialize
    const json = m.serialize();
    const m2 = new TupleManagerV3();
    m2.deserialize(json);
    const t3 = m2.get('TEST|BTC-USD|1H', 'TEST', 'BTC-USD', '1H');
    if (t3.totalTrades !== 25) throw new Error('serialize lost trades');
    return `25 losses → active=${t2.active}, posterior=${t2.posteriorExpectancyBps.toFixed(1)}, round-trip OK`;
  });

  await step('6. Kelly fraction sanity', async () => {
    const m = new TupleManagerV3();
    const t = m.get('K|BTC-USD|1H', 'K', 'BTC-USD', '1H');
    // No history → probe size
    if (kellyFraction(t) !== 0.005) throw new Error('probe size wrong');
    // Mostly winners
    for (let i = 0; i < 20; i++) m.update('K|BTC-USD|1H', 100);
    for (let i = 0; i < 5; i++) m.update('K|BTC-USD|1H', -50);
    const f = kellyFraction(m.get('K|BTC-USD|1H', 'K', 'BTC-USD', '1H'));
    if (f <= 0 || f > 0.05) throw new Error(`kelly out of range: ${f}`);
    return `winning tuple → fraction=${(f * 100).toFixed(2)}%`;
  });

  await step('7. Orchestrator tick (no real persistence)', async () => {
    const bars = allBars['BTC-USD|1H'];
    const ind = precompute(bars);
    const tuples = new TupleManagerV3();
    const portfolio = makeFreshPortfolio();
    const stream: StreamSnapshot = { asset: 'BTC-USD', tf: '1H', bars, indicators: ind };
    const result = orchestratorTick({ stream, idx: bars.length - 2, tuples, portfolio });
    return `entries=${result.entries.length} exits=${result.exits.length}`;
  });

  await step('8. Persistence round-trip', async () => {
    const beforeMode = await getMode();
    await setMode('paper');
    const after = await getMode();
    if (after !== 'paper') throw new Error(`expected paper, got ${after}`);
    await setMode(beforeMode); // restore
    const tuples = await loadTuples();
    const portfolio = await loadPortfolio();
    if (!portfolio.cfg) throw new Error('portfolio cfg missing');
    return `mode round-trip OK, tuples=${tuples.size()}, portfolio.equity=$${portfolio.equity}`;
  });

  await step('9. Alpaca paper account reachable', async () => {
    const acct = await getPaperAccount();
    if (!acct.ok) throw new Error(acct.error ?? 'unreachable');
    return `equity=$${acct.equity?.toFixed(0)} cash=$${acct.cash?.toFixed(0)} status=${acct.status}`;
  });

  await step('10. Alpaca paper order place + cancel', async () => {
    // Place a tiny limit order far from market to ensure no fill, then cancel.
    const sym = 'BTC/USD';
    const bars = allBars['BTC-USD|1H'];
    const px = bars[bars.length - 1].close;
    const farPrice = (px * 0.5).toFixed(2); // 50% below market — won't fill
    const headers = {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
      'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
      'Content-Type': 'application/json',
    };
    const base = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
    const placeRes = await fetch(`${base}/v2/orders`, {
      method: 'POST', headers,
      body: JSON.stringify({
        // Need cost_basis ≥ $10 → at far_price ~$40k, qty 0.001 = $40 cost basis
        symbol: sym, qty: '0.001', side: 'buy', type: 'limit',
        limit_price: farPrice, time_in_force: 'gtc',
      }),
    });
    if (!placeRes.ok) {
      const txt = await placeRes.text();
      throw new Error(`place HTTP ${placeRes.status}: ${txt.slice(0, 100)}`);
    }
    const order = await placeRes.json() as { id: string };
    // Cancel immediately
    const cancelRes = await fetch(`${base}/v2/orders/${order.id}`, { method: 'DELETE', headers });
    if (cancelRes.status !== 204 && !cancelRes.ok) {
      throw new Error(`cancel HTTP ${cancelRes.status}`);
    }
    return `order ${order.id.slice(0, 8)}… placed @ $${farPrice} and cancelled`;
  });

  await step('11. Closed-trade append + read', async () => {
    const dummy = {
      tupleKey: 'TEST|FAKE|1H', asset: 'BTC-USD' as AssetV3, tf: '1H' as TfV3, primitive: 'TEST',
      entryBar: 100, entryTs: Date.now() - 3600000, entryPrice: 50000,
      dir: 'long' as const, stopPrice: 49000, tpPrice: 52000, timeStopBars: 24,
      notional: 100, riskBps: 200,
      exitBar: 124, exitTs: Date.now(), exitPrice: 51000,
      netBps: 100, netDollars: 1.0, reason: 'tp' as const,
    };
    await appendClosedTrades([dummy]);
    const back = await readClosedTrades();
    const found = back.some((t) => t.tupleKey === 'TEST|FAKE|1H');
    if (!found) throw new Error('appended trade not readable');
    // Clean up: remove test rows
    const cleaned = back.filter((t) => t.tupleKey !== 'TEST|FAKE|1H');
    fs.writeFileSync(path.join(getStateDir(), 'closed.json'), JSON.stringify(cleaned, null, 2));
    return `append+read OK, ${back.length} total`;
  });

  await step('12. Live approval flag is OFF', async () => {
    const ok = await isLiveApproved();
    if (ok) throw new Error('approve_live file present — should not be at this point!');
    return 'absent (correct)';
  });

  await step('13. Run evaluator script', async () => {
    const { execSync } = await import('node:child_process');
    const out = execSync('./node_modules/.bin/tsx scripts/v3-evaluator.ts', { encoding: 'utf8' });
    if (!out.includes('decision=')) throw new Error('no decision in output');
    return out.split('\n').filter(Boolean).pop()?.trim() ?? '';
  });

  console.log(`\n═══ ${passed} passed, ${failed} failed ═══`);

  // Write report
  fs.writeFileSync(path.join(getStateDir(), 'system-test-report.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    passed, failed,
    results,
  }, null, 2));
  console.log(`Report → ${path.join(getStateDir(), 'system-test-report.json')}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
