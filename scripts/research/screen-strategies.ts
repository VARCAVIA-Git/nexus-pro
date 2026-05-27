// ═══════════════════════════════════════════════════════════════
// Strategy Screening — find candidates with real edge
//
// Tests multiple parameter sets across BTC/ETH/SOL on 1h and 5m
// timeframes, with realistic maker cost model (8 bps RT).
//
// Strategies tested:
//   A. RSI bidir (cross above/below thresholds)
//   B. RSI extreme entry (no cross, just inside extreme)
//   C. Bollinger mean reversion (price beyond N-sigma + RSI confirm)
//   D. Donchian breakout (long N-bar high, short N-bar low)
//   E. EMA pullback (long pullback to EMA in uptrend)
//
// Each combo is run with:
//   - Walk-forward 4-fold (must be all-positive)
//   - Bootstrap p-value < 0.05 (one-sided)
//   - Min 50 trades
//   - Profit factor >= 1.1
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
const OKX_BASE = 'https://www.okx.com/api/v5';

const MAKER_COSTS_RT_BPS = 6; // (1.5 + 1.0 + 0.5) * 2

interface Bar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toOkxInstId(s: string): string {
  return ({
    'BTC-USD': 'BTC-USDT-SWAP',
    'ETH-USD': 'ETH-USDT-SWAP',
    'SOL-USD': 'SOL-USDT-SWAP',
  } as Record<string, string>)[s] ?? 'BTC-USDT-SWAP';
}

async function fetchOkx(symbol: string, bar: '5m' | '1H', target: number): Promise<Bar[]> {
  const instId = toOkxInstId(symbol);
  const out: Bar[] = [];
  let after: string | undefined;
  let safety = 300;

  while (out.length < target && safety-- > 0) {
    const url = new URL(`${OKX_BASE}/market/history-candles`);
    url.searchParams.set('instId', instId);
    url.searchParams.set('bar', bar);
    url.searchParams.set('limit', '300');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) {
      console.error(`[OKX] ${instId} ${bar} HTTP ${res.status}`);
      break;
    }
    const data = (await res.json()) as { code: string; msg: string; data: string[][] };
    if (data.code !== '0') {
      console.error(`[OKX] ${instId} ${bar} err ${data.msg}`);
      break;
    }
    const batch = data.data ?? [];
    if (batch.length === 0) break;

    for (const c of batch) {
      out.push({
        ts: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      });
    }
    after = batch[batch.length - 1][0];
    await new Promise((r) => setTimeout(r, 120));
  }

  const seen = new Set<number>();
  return out
    .filter((b) => (seen.has(b.ts) ? false : (seen.add(b.ts), true)))
    .sort((a, b) => a.ts - b.ts);
}

// ─── Indicators ──────────────────────────────────────────────

function rsi(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return out;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((s, x) => s + x, 0) / period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function stdev(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const out = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

// ─── Strategy signal generators ──────────────────────────────
//
// Each returns: at bar i, given history bars[0..i], an optional
// signal { dir: 'long'|'short' }. The backtest opens at next bar
// open, holds for `holdBars`, then closes (no SL/TP for screening
// — keep it simple, edge-detection only).

type SignalFn = (bars: Bar[], i: number, p: Params) => { dir: 'long' | 'short' } | null;

interface Params {
  rsiPeriod?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
  bbPeriod?: number;
  bbSigma?: number;
  donchPeriod?: number;
  emaFast?: number;
  emaSlow?: number;
  pullbackPct?: number;
}

// A: RSI bidir cross
const sigRsiCross: SignalFn = (bars, i, p) => {
  if (i < (p.rsiPeriod ?? 14) + 1) return null;
  const closes = bars.slice(0, i + 1).map((b) => b.close);
  const r = rsi(closes, p.rsiPeriod ?? 14);
  const cur = r[r.length - 1];
  const prev = r[r.length - 2];
  if (cur < (p.rsiOversold ?? 30) && prev >= (p.rsiOversold ?? 30)) return { dir: 'long' };
  if (cur > (p.rsiOverbought ?? 70) && prev <= (p.rsiOverbought ?? 70)) return { dir: 'short' };
  return null;
};

// B: RSI extreme inside (no cross required — fires every bar inside zone, with cooldown)
const sigRsiInside: SignalFn = (bars, i, p) => {
  if (i < (p.rsiPeriod ?? 14)) return null;
  const closes = bars.slice(0, i + 1).map((b) => b.close);
  const r = rsi(closes, p.rsiPeriod ?? 14)[i];
  if (r < (p.rsiOversold ?? 25)) return { dir: 'long' };
  if (r > (p.rsiOverbought ?? 75)) return { dir: 'short' };
  return null;
};

// C: Bollinger mean reversion + RSI filter
const sigBbReversion: SignalFn = (bars, i, p) => {
  const period = p.bbPeriod ?? 20;
  const sigma = p.bbSigma ?? 2;
  if (i < Math.max(period, 14)) return null;
  const closes = bars.slice(0, i + 1).map((b) => b.close);
  const mean = sma(closes, period)[i];
  const sd = stdev(closes, period)[i];
  const r = rsi(closes, 14)[i];
  const upper = mean + sigma * sd;
  const lower = mean - sigma * sd;
  const px = closes[i];
  if (px <= lower && r < (p.rsiOversold ?? 30)) return { dir: 'long' };
  if (px >= upper && r > (p.rsiOverbought ?? 70)) return { dir: 'short' };
  return null;
};

// D: Donchian breakout
const sigDonchian: SignalFn = (bars, i, p) => {
  const period = p.donchPeriod ?? 24;
  if (i < period + 1) return null;
  const lookback = bars.slice(i - period, i);
  const high = lookback.reduce((m, b) => Math.max(m, b.high), -Infinity);
  const low = lookback.reduce((m, b) => Math.min(m, b.low), Infinity);
  const px = bars[i].close;
  if (px > high) return { dir: 'long' };
  if (px < low) return { dir: 'short' };
  return null;
};

// E: EMA pullback in trend (long only — pullback to EMA fast in uptrend)
const sigEmaPullback: SignalFn = (bars, i, p) => {
  const fast = p.emaFast ?? 20;
  const slow = p.emaSlow ?? 50;
  const pull = p.pullbackPct ?? 0.005;
  if (i < slow + 5) return null;
  const closes = bars.slice(0, i + 1).map((b) => b.close);
  const e1 = ema(closes, fast);
  const e2 = ema(closes, slow);
  const cur = closes[i];
  const e1Now = e1[i], e2Now = e2[i];
  if (!isFinite(e1Now) || !isFinite(e2Now)) return null;

  // Uptrend: fast > slow, price within `pull` of fast EMA from above.
  if (e1Now > e2Now && cur >= e1Now * (1 - pull) && cur <= e1Now * (1 + pull / 2)) {
    return { dir: 'long' };
  }
  // Downtrend mirror
  if (e1Now < e2Now && cur <= e1Now * (1 + pull) && cur >= e1Now * (1 - pull / 2)) {
    return { dir: 'short' };
  }
  return null;
};

const STRATEGIES: Array<{
  id: string;
  name: string;
  fn: SignalFn;
  params: Params;
  holdBars: number;
  cooldownBars: number;
}> = [];

// Generate parameter sweeps
function buildStrategies() {
  // A: RSI cross variants
  for (const oversold of [25, 30, 35]) {
    for (const hold of [12, 24, 48]) {
      STRATEGIES.push({
        id: `RSI_CROSS_${oversold}_${100 - oversold}_h${hold}`,
        name: `RSI cross ${oversold}/${100 - oversold}, hold ${hold}b`,
        fn: sigRsiCross,
        params: { rsiPeriod: 14, rsiOversold: oversold, rsiOverbought: 100 - oversold },
        holdBars: hold,
        cooldownBars: 6,
      });
    }
  }
  // B: RSI inside (more selective)
  for (const oversold of [20, 25]) {
    for (const hold of [12, 24, 48]) {
      STRATEGIES.push({
        id: `RSI_INSIDE_${oversold}_${100 - oversold}_h${hold}`,
        name: `RSI inside ${oversold}/${100 - oversold}, hold ${hold}b`,
        fn: sigRsiInside,
        params: { rsiPeriod: 14, rsiOversold: oversold, rsiOverbought: 100 - oversold },
        holdBars: hold,
        cooldownBars: hold, // longer cooldown — avoid spam
      });
    }
  }
  // C: Bollinger reversion
  for (const sigma of [2, 2.5]) {
    for (const hold of [12, 24, 48]) {
      STRATEGIES.push({
        id: `BB_REV_s${sigma}_h${hold}`,
        name: `BB reversion ${sigma}σ + RSI, hold ${hold}b`,
        fn: sigBbReversion,
        params: { bbPeriod: 20, bbSigma: sigma, rsiOversold: 30, rsiOverbought: 70 },
        holdBars: hold,
        cooldownBars: 6,
      });
    }
  }
  // D: Donchian
  for (const period of [24, 48, 96]) {
    for (const hold of [24, 48, 96]) {
      STRATEGIES.push({
        id: `DONCH_${period}_h${hold}`,
        name: `Donchian ${period}b breakout, hold ${hold}b`,
        fn: sigDonchian,
        params: { donchPeriod: period },
        holdBars: hold,
        cooldownBars: 12,
      });
    }
  }
  // E: EMA pullback
  for (const slow of [50, 100]) {
    for (const hold of [12, 24, 48]) {
      STRATEGIES.push({
        id: `EMA_PB_${slow}_h${hold}`,
        name: `EMA pullback fast20/slow${slow}, hold ${hold}b`,
        fn: sigEmaPullback,
        params: { emaFast: 20, emaSlow: slow, pullbackPct: 0.004 },
        holdBars: hold,
        cooldownBars: 6,
      });
    }
  }
}

// ─── Backtest engine (frozen, no lookahead, hold-only exit) ──

interface Trade {
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  dir: 'long' | 'short';
  netBps: number;
}

function backtest(
  bars: Bar[],
  fn: SignalFn,
  params: Params,
  holdBars: number,
  cooldownBars: number,
  costRtBps: number,
): Trade[] {
  const trades: Trade[] = [];
  let inPos = false;
  let entryBar = 0;
  let entryPx = 0;
  let dir: 'long' | 'short' = 'long';
  let cooldownUntil = 0;

  for (let i = 0; i < bars.length - 1; i++) {
    if (inPos && i - entryBar >= holdBars) {
      const exitPx = bars[i].close;
      const grossBps = dir === 'long'
        ? ((exitPx - entryPx) / entryPx) * 10000
        : ((entryPx - exitPx) / entryPx) * 10000;
      trades.push({
        entryBar, exitBar: i, entryPrice: entryPx, exitPrice: exitPx,
        dir, netBps: grossBps - costRtBps,
      });
      inPos = false;
      cooldownUntil = i + cooldownBars;
      continue;
    }
    if (inPos || i < cooldownUntil) continue;

    const sig = fn(bars, i, params);
    if (sig) {
      // Enter at NEXT bar's open (no lookahead)
      if (i + 1 >= bars.length) continue;
      inPos = true;
      entryBar = i + 1;
      entryPx = bars[i + 1].open;
      dir = sig.dir;
    }
  }

  return trades;
}

// ─── Metrics ─────────────────────────────────────────────────

interface Metrics {
  trades: number;
  win_rate: number;
  net_bps: number;
  avg_bps: number;
  sharpe: number;
  pf: number;
  max_dd_bps: number;
}

function calcMetrics(trades: Trade[]): Metrics {
  if (trades.length === 0) {
    return { trades: 0, win_rate: 0, net_bps: 0, avg_bps: 0, sharpe: 0, pf: 0, max_dd_bps: 0 };
  }
  const rs = trades.map((t) => t.netBps);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const sum = rs.reduce((s, r) => s + r, 0);
  const mean = sum / rs.length;
  const variance = rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length;
  const sd = Math.sqrt(variance);
  let peak = 0, dd = 0, cum = 0;
  for (const r of rs) {
    cum += r;
    if (cum > peak) peak = cum;
    if (peak - cum > dd) dd = peak - cum;
  }
  const grossWin = wins.reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  return {
    trades: trades.length,
    win_rate: Math.round((wins.length / rs.length) * 1000) / 10,
    net_bps: Math.round(sum * 10) / 10,
    avg_bps: Math.round(mean * 100) / 100,
    sharpe: sd > 0 ? Math.round((mean / sd) * Math.sqrt(rs.length) * 100) / 100 : 0,
    pf: Math.round(pf * 100) / 100,
    max_dd_bps: Math.round(dd * 10) / 10,
  };
}

function walkForward(
  bars: Bar[],
  fn: SignalFn,
  params: Params,
  holdBars: number,
  cooldownBars: number,
  costRtBps: number,
  folds = 4,
): { allPositive: boolean; foldsNet: number[] } {
  const size = Math.floor(bars.length / folds);
  const out: number[] = [];
  for (let k = 0; k < folds; k++) {
    const start = k * size;
    const end = k === folds - 1 ? bars.length : (k + 1) * size;
    const slice = bars.slice(start, end);
    const trades = backtest(slice, fn, params, holdBars, cooldownBars, costRtBps);
    out.push(calcMetrics(trades).net_bps);
  }
  return { allPositive: out.every((n) => n > 0), foldsNet: out };
}

function bootstrapPValue(returns: number[], iters = 1000): number {
  if (returns.length < 10) return 1;
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  if (mean <= 0) return 1;
  const centered = returns.map((r) => r - mean);
  let nullOrWorse = 0;
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += centered[Math.floor(Math.random() * n)];
    if (s / n >= mean) nullOrWorse++;
  }
  return nullOrWorse / iters;
}

// ─── Main ───────────────────────────────────────────────────

interface Result {
  strategy: string;
  symbol: string;
  tf: string;
  metrics: Metrics;
  walk_all_positive: boolean;
  walk_folds_net: number[];
  bootstrap_p: number;
  passes: boolean;
  reasons: string[];
}

async function main() {
  buildStrategies();
  console.log(`Built ${STRATEGIES.length} strategy variants`);

  const TFs: Array<{ tf: '5m' | '1H'; barsTarget: number; minTrades: number }> = [
    { tf: '1H', barsTarget: 365 * 24, minTrades: 60 }, // ~1 year for statistical power
  ];

  const results: Result[] = [];

  for (const symbol of SYMBOLS) {
    for (const tfCfg of TFs) {
      console.log(`\n━━━ ${symbol} ${tfCfg.tf} (~${tfCfg.barsTarget} bars) ━━━`);
      const bars = await fetchOkx(symbol, tfCfg.tf, tfCfg.barsTarget);
      console.log(`  ${bars.length} bars fetched`);
      if (bars.length < 500) {
        console.log('  insufficient — skipping');
        continue;
      }

      for (const strat of STRATEGIES) {
        const trades = backtest(bars, strat.fn, strat.params, strat.holdBars, strat.cooldownBars, MAKER_COSTS_RT_BPS);
        const m = calcMetrics(trades);

        // Quick filter
        if (m.trades < tfCfg.minTrades) continue;
        if (m.net_bps <= 0) continue;
        if (m.pf < 1.05) continue;

        // Deeper validation
        const wf = walkForward(bars, strat.fn, strat.params, strat.holdBars, strat.cooldownBars, MAKER_COSTS_RT_BPS);
        const p = bootstrapPValue(trades.map((t) => t.netBps), 1000);

        const reasons: string[] = [];
        if (!wf.allPositive) reasons.push(`walk-forward not all-positive: [${wf.foldsNet.join(', ')}]`);
        if (p >= 0.05) reasons.push(`p-value ${p.toFixed(3)} ≥ 0.05`);
        if (m.pf < 1.1) reasons.push(`PF ${m.pf} < 1.1`);

        const passes = reasons.length === 0;
        const r: Result = {
          strategy: strat.id,
          symbol,
          tf: tfCfg.tf,
          metrics: m,
          walk_all_positive: wf.allPositive,
          walk_folds_net: wf.foldsNet,
          bootstrap_p: Math.round(p * 1000) / 1000,
          passes,
          reasons,
        };
        results.push(r);

        const tag = passes ? '✅ PASS' : '⚠ ';
        console.log(
          `  ${tag} ${strat.id.padEnd(28)} t=${String(m.trades).padStart(4)} net=${
            String(m.net_bps).padStart(7)
          }bps win=${String(m.win_rate).padStart(4)}% pf=${String(m.pf).padStart(4)} p=${p.toFixed(3)} wf=${wf.allPositive ? 'OK' : 'NO'}`,
        );
      }
    }
  }

  // Sort: passes first, then by net bps desc
  results.sort((a, b) => {
    if (a.passes !== b.passes) return a.passes ? -1 : 1;
    return b.metrics.net_bps - a.metrics.net_bps;
  });

  const outDir = path.join(process.cwd(), 'docs', 'nexusone');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'STRATEGY_SCREENING.json');
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    cost_model_rt_bps: MAKER_COSTS_RT_BPS,
    total_combinations_tested: STRATEGIES.length * SYMBOLS.length * TFs.length,
    candidates_reported: results.length,
    passes: results.filter((r) => r.passes).length,
    results,
  }, null, 2));

  console.log('\n━━━ SUMMARY ━━━');
  const passing = results.filter((r) => r.passes);
  console.log(`${results.length} candidates with positive net edge, ${passing.length} pass full validation\n`);

  if (passing.length > 0) {
    console.log('PASSING STRATEGIES:');
    for (const r of passing) {
      console.log(
        `  ${r.symbol} ${r.tf} ${r.strategy} → ${r.metrics.net_bps}bps ` +
          `(${r.metrics.trades} trades, win ${r.metrics.win_rate}%, PF ${r.metrics.pf}, p=${r.bootstrap_p})`,
      );
    }
  } else {
    console.log('No strategies pass full validation.');
    console.log('\nTop 10 candidates that failed validation:');
    for (const r of results.slice(0, 10)) {
      console.log(
        `  ${r.symbol} ${r.tf} ${r.strategy} → net=${r.metrics.net_bps}bps PF=${r.metrics.pf} ` +
          `→ ${r.reasons.join(' | ')}`,
      );
    }
  }
  console.log(`\nFull report: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
