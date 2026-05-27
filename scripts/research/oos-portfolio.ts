// ═══════════════════════════════════════════════════════════════
// True Out-of-Sample Portfolio Validation
//
// 1. Fetch 1 year of 1H data for BTC, ETH, SOL.
// 2. Split into IS (first 75%) and OOS (last 25%).
// 3. Run full strategy screen on IS only.
// 4. Build greedy stability portfolio on IS folds (4-fold WF on IS).
// 5. Apply the SELECTED portfolio strategies to OOS data.
// 6. Verify OOS is positive — that's the only honest test.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
const OKX_BASE = 'https://www.okx.com/api/v5';
const MAKER_RT_BPS = 6;
const TF: '1H' = '1H';
const TARGET_BARS = 365 * 24;

interface Bar {
  ts: number; open: number; high: number; low: number; close: number; volume: number;
}

function toOkx(s: string): string {
  return ({ 'BTC-USD': 'BTC-USDT-SWAP', 'ETH-USD': 'ETH-USDT-SWAP', 'SOL-USD': 'SOL-USDT-SWAP' } as Record<string, string>)[s] ?? s;
}

async function fetchBars(symbol: string, target: number): Promise<Bar[]> {
  const inst = toOkx(symbol);
  const out: Bar[] = [];
  let after: string | undefined;
  let safety = 200;
  while (out.length < target && safety-- > 0) {
    const url = new URL(`${OKX_BASE}/market/history-candles`);
    url.searchParams.set('instId', inst);
    url.searchParams.set('bar', TF);
    url.searchParams.set('limit', '300');
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) break;
    const data = (await res.json()) as { code: string; data: string[][] };
    if (data.code !== '0') break;
    const batch = data.data ?? [];
    if (batch.length === 0) break;
    for (const c of batch) {
      out.push({
        ts: parseInt(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
        low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]),
      });
    }
    after = batch[batch.length - 1][0];
    await new Promise((r) => setTimeout(r, 120));
  }
  const seen = new Set<number>();
  return out.filter((b) => (seen.has(b.ts) ? false : (seen.add(b.ts), true))).sort((a, b) => a.ts - b.ts);
}

function rsi(c: number[], p = 14): number[] {
  const o = new Array(c.length).fill(50);
  if (c.length < p + 1) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l += -d; }
  g /= p; l /= p;
  for (let i = p; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (p - 1) + (d > 0 ? d : 0)) / p;
    l = (l * (p - 1) + (d < 0 ? -d : 0)) / p;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
}
function ema(v: number[], p: number): number[] {
  const o = new Array(v.length).fill(NaN);
  const k = 2 / (p + 1);
  let e = v.slice(0, p).reduce((s, x) => s + x, 0) / p;
  o[p - 1] = e;
  for (let i = p; i < v.length; i++) { e = v[i] * k + e * (1 - k); o[i] = e; }
  return o;
}
function sma(v: number[], p: number): number[] {
  const o = new Array(v.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= p) s -= v[i - p]; if (i >= p - 1) o[i] = s / p; }
  return o;
}
function stdev(v: number[], p: number): number[] {
  const m = sma(v, p);
  const o = new Array(v.length).fill(NaN);
  for (let i = p - 1; i < v.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - m[i]) ** 2;
    o[i] = Math.sqrt(s / p);
  }
  return o;
}

interface Params {
  rsiPeriod?: number; rsiOversold?: number; rsiOverbought?: number;
  bbPeriod?: number; bbSigma?: number; donchPeriod?: number;
  emaFast?: number; emaSlow?: number; pullbackPct?: number;
}

type SignalFn = (bars: Bar[], i: number, p: Params) => { dir: 'long' | 'short' } | null;

const sigRsiCross: SignalFn = (b, i, p) => {
  if (i < (p.rsiPeriod ?? 14) + 1) return null;
  const c = b.slice(0, i + 1).map((x) => x.close);
  const r = rsi(c, p.rsiPeriod ?? 14);
  const cur = r[r.length - 1], prev = r[r.length - 2];
  if (cur < (p.rsiOversold ?? 30) && prev >= (p.rsiOversold ?? 30)) return { dir: 'long' };
  if (cur > (p.rsiOverbought ?? 70) && prev <= (p.rsiOverbought ?? 70)) return { dir: 'short' };
  return null;
};
const sigRsiInside: SignalFn = (b, i, p) => {
  if (i < (p.rsiPeriod ?? 14)) return null;
  const c = b.slice(0, i + 1).map((x) => x.close);
  const r = rsi(c, p.rsiPeriod ?? 14)[i];
  if (r < (p.rsiOversold ?? 25)) return { dir: 'long' };
  if (r > (p.rsiOverbought ?? 75)) return { dir: 'short' };
  return null;
};
const sigBbReversion: SignalFn = (b, i, p) => {
  const per = p.bbPeriod ?? 20;
  if (i < Math.max(per, 14)) return null;
  const c = b.slice(0, i + 1).map((x) => x.close);
  const m = sma(c, per)[i];
  const sd = stdev(c, per)[i];
  const r = rsi(c, 14)[i];
  const px = c[i];
  if (px <= m - (p.bbSigma ?? 2) * sd && r < (p.rsiOversold ?? 30)) return { dir: 'long' };
  if (px >= m + (p.bbSigma ?? 2) * sd && r > (p.rsiOverbought ?? 70)) return { dir: 'short' };
  return null;
};
const sigDonchian: SignalFn = (b, i, p) => {
  const per = p.donchPeriod ?? 24;
  if (i < per + 1) return null;
  const lk = b.slice(i - per, i);
  const h = lk.reduce((m, x) => Math.max(m, x.high), -Infinity);
  const l = lk.reduce((m, x) => Math.min(m, x.low), Infinity);
  const px = b[i].close;
  if (px > h) return { dir: 'long' };
  if (px < l) return { dir: 'short' };
  return null;
};
const sigEmaPullback: SignalFn = (b, i, p) => {
  const f = p.emaFast ?? 20, s = p.emaSlow ?? 50, pull = p.pullbackPct ?? 0.005;
  if (i < s + 5) return null;
  const c = b.slice(0, i + 1).map((x) => x.close);
  const e1 = ema(c, f)[i], e2 = ema(c, s)[i], cur = c[i];
  if (!isFinite(e1) || !isFinite(e2)) return null;
  if (e1 > e2 && cur >= e1 * (1 - pull) && cur <= e1 * (1 + pull / 2)) return { dir: 'long' };
  if (e1 < e2 && cur <= e1 * (1 + pull) && cur >= e1 * (1 - pull / 2)) return { dir: 'short' };
  return null;
};

interface Strat { id: string; fn: SignalFn; params: Params; holdBars: number; cooldownBars: number; }

function buildStrategies(): Strat[] {
  const out: Strat[] = [];
  for (const os of [25, 30, 35]) for (const h of [12, 24, 48]) {
    out.push({ id: `RSI_CROSS_${os}_${100 - os}_h${h}`, fn: sigRsiCross, params: { rsiPeriod: 14, rsiOversold: os, rsiOverbought: 100 - os }, holdBars: h, cooldownBars: 6 });
  }
  for (const os of [20, 25]) for (const h of [12, 24, 48]) {
    out.push({ id: `RSI_INSIDE_${os}_${100 - os}_h${h}`, fn: sigRsiInside, params: { rsiPeriod: 14, rsiOversold: os, rsiOverbought: 100 - os }, holdBars: h, cooldownBars: h });
  }
  for (const sg of [2, 2.5]) for (const h of [12, 24, 48]) {
    out.push({ id: `BB_REV_s${sg}_h${h}`, fn: sigBbReversion, params: { bbPeriod: 20, bbSigma: sg, rsiOversold: 30, rsiOverbought: 70 }, holdBars: h, cooldownBars: 6 });
  }
  for (const per of [24, 48, 96]) for (const h of [24, 48, 96]) {
    out.push({ id: `DONCH_${per}_h${h}`, fn: sigDonchian, params: { donchPeriod: per }, holdBars: h, cooldownBars: 12 });
  }
  for (const sl of [50, 100]) for (const h of [12, 24, 48]) {
    out.push({ id: `EMA_PB_${sl}_h${h}`, fn: sigEmaPullback, params: { emaFast: 20, emaSlow: sl, pullbackPct: 0.004 }, holdBars: h, cooldownBars: 6 });
  }
  return out;
}

interface Trade { entryBar: number; exitBar: number; entryPrice: number; exitPrice: number; dir: 'long' | 'short'; netBps: number; }

function backtest(bars: Bar[], st: Strat, costRt = MAKER_RT_BPS): Trade[] {
  const tr: Trade[] = [];
  let inPos = false, entryBar = 0, entryPx = 0, dir: 'long' | 'short' = 'long', cooldown = 0;
  for (let i = 0; i < bars.length - 1; i++) {
    if (inPos && i - entryBar >= st.holdBars) {
      const exit = bars[i].close;
      const gross = dir === 'long' ? ((exit - entryPx) / entryPx) * 10000 : ((entryPx - exit) / entryPx) * 10000;
      tr.push({ entryBar, exitBar: i, entryPrice: entryPx, exitPrice: exit, dir, netBps: gross - costRt });
      inPos = false; cooldown = i + st.cooldownBars; continue;
    }
    if (inPos || i < cooldown) continue;
    const sig = st.fn(bars, i, st.params);
    if (sig && i + 1 < bars.length) {
      inPos = true; entryBar = i + 1; entryPx = bars[i + 1].open; dir = sig.dir;
    }
  }
  return tr;
}

function metrics(trs: Trade[]) {
  if (trs.length === 0) return { trades: 0, win_rate: 0, net_bps: 0, pf: 0, sharpe: 0, max_dd_bps: 0, avg_bps: 0 };
  const rs = trs.map((t) => t.netBps);
  const w = rs.filter((r) => r > 0), l = rs.filter((r) => r <= 0);
  const sum = rs.reduce((s, r) => s + r, 0);
  const mean = sum / rs.length;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length);
  let peak = 0, dd = 0, cum = 0;
  for (const r of rs) { cum += r; if (cum > peak) peak = cum; if (peak - cum > dd) dd = peak - cum; }
  const gw = w.reduce((s, r) => s + r, 0), gl = Math.abs(l.reduce((s, r) => s + r, 0));
  return {
    trades: rs.length,
    win_rate: Math.round(w.length / rs.length * 1000) / 10,
    net_bps: Math.round(sum * 10) / 10,
    avg_bps: Math.round(mean * 100) / 100,
    sharpe: sd > 0 ? Math.round(mean / sd * Math.sqrt(rs.length) * 100) / 100 : 0,
    pf: Math.round((gl > 0 ? gw / gl : (gw > 0 ? 99 : 0)) * 100) / 100,
    max_dd_bps: Math.round(dd * 10) / 10,
  };
}

function walkForward(bars: Bar[], st: Strat, folds = 4) {
  const sz = Math.floor(bars.length / folds);
  const out: number[] = [];
  for (let k = 0; k < folds; k++) {
    const start = k * sz;
    const end = k === folds - 1 ? bars.length : (k + 1) * sz;
    const trs = backtest(bars.slice(start, end), st);
    out.push(metrics(trs).net_bps);
  }
  return { allPositive: out.every((x) => x > 0), folds: out };
}

function bootstrap(rs: number[], it = 1000): number {
  if (rs.length < 10) return 1;
  const n = rs.length;
  const m = rs.reduce((s, r) => s + r, 0) / n;
  if (m <= 0) return 1;
  const c = rs.map((r) => r - m);
  let bad = 0;
  for (let i = 0; i < it; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += c[Math.floor(Math.random() * n)];
    if (s / n >= m) bad++;
  }
  return bad / it;
}

interface Cand { id: string; symbol: string; net: number; folds: number[]; pf: number; trades: number; }

async function main() {
  console.log('Fetching 1Y 1H data for BTC, ETH, SOL...');
  const dataMap = new Map<string, Bar[]>();
  for (const s of SYMBOLS) {
    const b = await fetchBars(s, TARGET_BARS);
    console.log(`  ${s}: ${b.length} bars`);
    dataMap.set(s, b);
  }

  const stratList = buildStrategies();
  console.log(`Strategy variants: ${stratList.length}`);

  // Split each symbol into IS (75%) and OOS (25%)
  const splits = new Map<string, { is: Bar[]; oos: Bar[] }>();
  for (const [s, b] of dataMap) {
    const cut = Math.floor(b.length * 0.75);
    splits.set(s, { is: b.slice(0, cut), oos: b.slice(cut) });
  }

  console.log('\n━━━ IS SCREENING ━━━');
  const isCandidates: Cand[] = [];
  for (const symbol of SYMBOLS) {
    const isBars = splits.get(symbol)!.is;
    for (const st of stratList) {
      const trs = backtest(isBars, st);
      const m = metrics(trs);
      if (m.trades < 30 || m.net_bps <= 0 || m.pf < 1.05) continue;
      const wf = walkForward(isBars, st, 4);
      isCandidates.push({ id: st.id, symbol, net: m.net_bps, folds: wf.folds, pf: m.pf, trades: m.trades });
    }
  }
  console.log(`${isCandidates.length} IS net-positive candidates with PF>=1.05`);

  // Greedy build using IS folds only
  isCandidates.sort((a, b) => b.net - a.net);

  function evalPort(cands: Cand[]) {
    const fold = [0, 0, 0, 0];
    for (const c of cands) for (let i = 0; i < 4; i++) fold[i] += (c.folds[i] ?? 0) / cands.length;
    const total = fold.reduce((a, b) => a + b, 0);
    return { fold, total, allPos: fold.every((x) => x > 0), minFold: Math.min(...fold), strategies: cands.map((c) => `${c.symbol}/${c.id}`) };
  }

  // Greedy stability portfolio (IS-only data used for selection)
  function greedy(pool: Cand[], maxSize = 8) {
    if (pool.length === 0) return { selected: [] as Cand[], port: evalPort([]) };
    const sel: Cand[] = [pool[0]];
    let best = evalPort(sel);
    const rem = pool.slice(1);
    while (sel.length < maxSize && rem.length > 0) {
      let bestNext = best, idx = -1;
      for (let i = 0; i < rem.length; i++) {
        const trial = evalPort([...sel, rem[i]]);
        if (trial.minFold > bestNext.minFold || (trial.minFold === bestNext.minFold && trial.total > bestNext.total)) {
          bestNext = trial; idx = i;
        }
      }
      if (idx < 0) break;
      sel.push(rem[idx]); rem.splice(idx, 1);
      best = bestNext;
    }
    return { selected: sel, port: best };
  }

  const isGreedy = greedy(isCandidates, 6);
  console.log('\nIS-built greedy stability portfolio:');
  for (const c of isGreedy.selected) console.log(`  - ${c.symbol}/${c.id} (IS net=${c.net}, folds=[${c.folds.join(',')}])`);
  console.log(`  IS folds: [${isGreedy.port.fold.map((x) => x.toFixed(0)).join(', ')}] bps`);
  console.log(`  IS all-positive: ${isGreedy.port.allPos}, min fold: ${isGreedy.port.minFold.toFixed(1)}`);

  console.log('\n━━━ TRUE OUT-OF-SAMPLE TEST ━━━');
  console.log('Applying selected strategies to held-out OOS (last 25%)...');

  const stratById = new Map(stratList.map((s) => [s.id, s]));
  const oosTrades: Record<string, Trade[]> = {};
  let allOosTrades: Trade[] = [];
  let totalOosNet = 0;

  for (const c of isGreedy.selected) {
    const st = stratById.get(c.id);
    if (!st) continue;
    const oosBars = splits.get(c.symbol)!.oos;
    const trs = backtest(oosBars, st);
    const m = metrics(trs);
    oosTrades[`${c.symbol}/${c.id}`] = trs;
    allOosTrades = allOosTrades.concat(trs);
    totalOosNet += m.net_bps;
    console.log(`  ${c.symbol}/${c.id}: t=${m.trades} net=${m.net_bps}bps win=${m.win_rate}% pf=${m.pf}`);
  }

  // Equal-weight portfolio metrics on OOS
  const portfolioOosNet = totalOosNet / isGreedy.selected.length;
  console.log(`\nEqual-weight portfolio OOS net: ${portfolioOosNet.toFixed(1)} bps`);
  const portfolioOosM = metrics(allOosTrades);
  console.log(`Combined OOS trades: ${portfolioOosM.trades}, raw sum=${portfolioOosM.net_bps}bps, win=${portfolioOosM.win_rate}%, PF=${portfolioOosM.pf}`);

  // Bootstrap p-value on combined OOS returns
  const oosP = bootstrap(allOosTrades.map((t) => t.netBps), 2000);
  console.log(`Bootstrap p-value (combined OOS, 2000 iter): ${oosP.toFixed(4)}`);

  const ok = portfolioOosNet > 0 && oosP < 0.10;
  console.log(`\nVERDICT: ${ok ? '✅ PORTFOLIO HOLDS OOS' : '❌ PORTFOLIO FAILS OOS'}`);

  const report = {
    generated_at: new Date().toISOString(),
    cost_model_rt_bps: MAKER_RT_BPS,
    timeframe: TF,
    is_split: 0.75,
    symbols: SYMBOLS,
    is_candidates_count: isCandidates.length,
    is_portfolio: {
      strategies: isGreedy.selected.map((c) => ({ symbol: c.symbol, id: c.id, is_net_bps: c.net, is_folds: c.folds, pf: c.pf, trades: c.trades })),
      is_folds_avg: isGreedy.port.fold,
      is_all_positive: isGreedy.port.allPos,
      is_min_fold: isGreedy.port.minFold,
    },
    oos: {
      per_strategy: Object.fromEntries(Object.entries(oosTrades).map(([k, v]) => [k, metrics(v)])),
      portfolio_avg_net_bps: Math.round(portfolioOosNet * 10) / 10,
      combined_metrics: portfolioOosM,
      bootstrap_p: Math.round(oosP * 10000) / 10000,
    },
    verdict: ok ? 'OOS_HOLDS' : 'OOS_FAILS',
  };

  const outPath = path.join(process.cwd(), 'docs', 'nexusone', 'OOS_PORTFOLIO_VALIDATION.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
