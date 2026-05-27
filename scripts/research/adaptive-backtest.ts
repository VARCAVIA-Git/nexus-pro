// ═══════════════════════════════════════════════════════════════
// NexusOne v3 — Adaptive Backtest Harness (optimized)
//
// Indicators precomputed once per stream → O(n) per stream total.
// 6 primitives × 6 assets × 2 timeframes = 72 tuples.
// Primitives are frozen rules; the adaptive layer changes which
// tuples are ACTIVE based on rolling performance ledger.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.join(__dirname, 'cache');
const COST_BPS_RT = 6;
const ASSETS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD'];
const TFS = ['1H', '4H'] as const;
type TF = typeof TFS[number];

interface Bar { ts: number; open: number; high: number; low: number; close: number; volume: number; }

type Regime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';

interface Indicators {
  rsi14: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  atr14: number[];
  sma20: number[];
  std20: number[];
  sma50: number[];
  std50: number[];
  regime: Regime[];
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
  if (v.length < p) return o;
  const k = 2 / (p + 1);
  let e = v.slice(0, p).reduce((s, x) => s + x, 0) / p;
  o[p - 1] = e;
  for (let i = p; i < v.length; i++) { e = v[i] * k + e * (1 - k); o[i] = e; }
  return o;
}
function smaArr(v: number[], p: number): number[] {
  const o = new Array(v.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= p) s -= v[i - p]; if (i >= p - 1) o[i] = s / p; }
  return o;
}
function stdArr(v: number[], p: number, m: number[]): number[] {
  const o = new Array(v.length).fill(NaN);
  for (let i = p - 1; i < v.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - m[i]) ** 2;
    o[i] = Math.sqrt(s / p);
  }
  return o;
}
function atrArr(bars: Bar[], p = 14): number[] {
  const o = new Array(bars.length).fill(NaN);
  if (bars.length < p + 1) return o;
  const trs = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    trs[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let s = 0;
  for (let i = 1; i <= p; i++) s += trs[i];
  o[p] = s / p;
  for (let i = p + 1; i < bars.length; i++) o[i] = (o[i - 1] * (p - 1) + trs[i]) / p;
  return o;
}

function precompute(bars: Bar[]): Indicators {
  const closes = bars.map((b) => b.close);
  const sma20 = smaArr(closes, 20);
  const sma50 = smaArr(closes, 50);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const a14 = atrArr(bars, 14);
  const r14 = rsi(closes, 14);

  // Regime per bar: 4 states.
  // VOLATILE if atr% > rolling 90th percentile of last 100 bars
  // TRENDING_UP if e20>e50>e200 AND separation > 0.5%
  // TRENDING_DOWN mirror
  // else RANGING
  const regime: Regime[] = new Array(bars.length).fill('RANGING');
  const atrPct = a14.map((a, i) => (isFinite(a) && a > 0 && bars[i].close > 0) ? a / bars[i].close : NaN);
  // Rolling 90th percentile of atrPct over last 100 bars (efficient: sorted window)
  const window: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const v = atrPct[i];
    if (isFinite(v)) {
      // Insert into sorted window
      const idx = window.findIndex((x) => x > v);
      if (idx === -1) window.push(v); else window.splice(idx, 0, v);
      if (window.length > 100) {
        // Remove oldest atrPct value (i-100). Find its position in sorted window.
        const old = atrPct[i - 100];
        if (isFinite(old)) {
          const oi = window.indexOf(old);
          if (oi >= 0) window.splice(oi, 1);
        }
      }
      const p90 = window[Math.floor(window.length * 0.9)] ?? v;
      const sep = (Math.abs(e20[i] - e50[i]) + Math.abs(e50[i] - e200[i])) / bars[i].close;
      if (v > p90 * 1.0 && window.length >= 30) regime[i] = 'VOLATILE';
      else if (isFinite(e20[i]) && isFinite(e50[i]) && isFinite(e200[i])) {
        if (e20[i] > e50[i] && e50[i] > e200[i] && sep > 0.005) regime[i] = 'TRENDING_UP';
        else if (e20[i] < e50[i] && e50[i] < e200[i] && sep > 0.005) regime[i] = 'TRENDING_DOWN';
        else regime[i] = 'RANGING';
      }
    }
  }

  return {
    rsi14: r14, ema20: e20, ema50: e50, ema200: e200,
    atr14: a14, sma20, std20: stdArr(closes, 20, sma20), sma50, std50: stdArr(closes, 50, sma50),
    regime,
  };
}

// ─── Primitives (precomputed-indicator versions) ─────────────

interface Signal { dir: 'long' | 'short'; entryPrice: number; stopAtr: number; tpAtr: number; timeStopBars: number; }
type PrimitiveFn = (bars: Bar[], ind: Indicators, i: number) => Signal | null;

interface PrimitiveDef { id: string; fn: PrimitiveFn; activeRegimes: Regime[]; }

const P_DONCH_24: PrimitiveFn = (b, ind, i) => {
  if (i < 25 || i + 1 >= b.length) return null;
  let h = -Infinity, l = Infinity;
  for (let j = i - 24; j < i; j++) { if (b[j].high > h) h = b[j].high; if (b[j].low < l) l = b[j].low; }
  const a = ind.atr14[i];
  if (!isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  const entryPrice = b[i + 1].open;
  if (px > h) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 3.0, timeStopBars: 48 };
  if (px < l) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 3.0, timeStopBars: 48 };
  return null;
};

const P_DONCH_48: PrimitiveFn = (b, ind, i) => {
  if (i < 49 || i + 1 >= b.length) return null;
  let h = -Infinity, l = Infinity;
  for (let j = i - 48; j < i; j++) { if (b[j].high > h) h = b[j].high; if (b[j].low < l) l = b[j].low; }
  const a = ind.atr14[i];
  if (!isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  const entryPrice = b[i + 1].open;
  if (px > h) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 3.5, timeStopBars: 72 };
  if (px < l) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 3.5, timeStopBars: 72 };
  return null;
};

const P_BB_REVERSION: PrimitiveFn = (b, ind, i) => {
  if (i < 25 || i + 1 >= b.length) return null;
  const m = ind.sma20[i], sd = ind.std20[i], r = ind.rsi14[i], a = ind.atr14[i];
  if (!isFinite(m) || !isFinite(sd) || !isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  const entryPrice = b[i + 1].open;
  if (px <= m - 2.5 * sd && r < 30) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 2.0, timeStopBars: 24 };
  if (px >= m + 2.5 * sd && r > 70) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 2.0, timeStopBars: 24 };
  return null;
};

const P_RSI_CROSS: PrimitiveFn = (b, ind, i) => {
  if (i < 16 || i + 1 >= b.length) return null;
  const cur = ind.rsi14[i], prev = ind.rsi14[i - 1], a = ind.atr14[i];
  if (!isFinite(a) || a <= 0) return null;
  const entryPrice = b[i + 1].open;
  if (cur < 30 && prev >= 30) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 24 };
  if (cur > 70 && prev <= 70) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 24 };
  return null;
};

const P_EMA_PULLBACK: PrimitiveFn = (b, ind, i) => {
  if (i < 100 || i + 1 >= b.length) return null;
  const e20 = ind.ema20[i], e50 = ind.ema50[i], a = ind.atr14[i];
  if (!isFinite(e20) || !isFinite(e50) || !isFinite(a) || a <= 0) return null;
  const px = b[i].close, entryPrice = b[i + 1].open;
  if (e20 > e50 && px <= e20 * 1.003 && px >= e20 * 0.998 && b[i - 1].close > b[i - 2].close) {
    return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 36 };
  }
  if (e20 < e50 && px >= e20 * 0.997 && px <= e20 * 1.002 && b[i - 1].close < b[i - 2].close) {
    return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 36 };
  }
  return null;
};

const P_RANGE_FADE: PrimitiveFn = (b, ind, i) => {
  if (i < 60 || i + 1 >= b.length) return null;
  const m = ind.sma50[i], sd = ind.std50[i], a = ind.atr14[i];
  if (!isFinite(m) || !isFinite(sd) || !isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  if (a / px > 0.012) return null;
  const entryPrice = b[i + 1].open;
  if (px <= m - 2 * sd) return { dir: 'long', entryPrice, stopAtr: 1.0, tpAtr: 1.8, timeStopBars: 16 };
  if (px >= m + 2 * sd) return { dir: 'short', entryPrice, stopAtr: 1.0, tpAtr: 1.8, timeStopBars: 16 };
  return null;
};

const PRIMITIVES: PrimitiveDef[] = [
  { id: 'DONCH_24', fn: P_DONCH_24, activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN', 'VOLATILE'] },
  { id: 'DONCH_48', fn: P_DONCH_48, activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN'] },
  { id: 'BB_REV',   fn: P_BB_REVERSION, activeRegimes: ['RANGING'] },
  { id: 'RSI_CROSS', fn: P_RSI_CROSS, activeRegimes: ['RANGING'] },
  { id: 'EMA_PB', fn: P_EMA_PULLBACK, activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN'] },
  { id: 'RANGE_FADE', fn: P_RANGE_FADE, activeRegimes: ['RANGING'] },
];

// ─── TupleState ──────────────────────────────────────────────

interface TupleState {
  key: string; primitive: string; asset: string; tf: TF;
  netBpsHistory: number[];
  active: boolean; cooldownUntilTrade: number; totalTrades: number;
  posteriorExpectancyBps: number;
}

class TupleManager {
  map = new Map<string, TupleState>();
  get(key: string, primitive: string, asset: string, tf: TF): TupleState {
    let s = this.map.get(key);
    if (!s) {
      s = { key, primitive, asset, tf, netBpsHistory: [], active: true, cooldownUntilTrade: 0, totalTrades: 0, posteriorExpectancyBps: 0 };
      this.map.set(key, s);
    }
    return s;
  }
  update(key: string, netBps: number) {
    const s = this.map.get(key);
    if (!s) return;
    s.netBpsHistory.push(netBps);
    s.totalTrades++;
    if (s.netBpsHistory.length > 50) s.netBpsHistory.shift();

    const n = s.netBpsHistory.length;
    const mean = s.netBpsHistory.reduce((a, b) => a + b, 0) / n;
    const priorWeight = 30, obsWeight = n;
    s.posteriorExpectancyBps = (0 * priorWeight + mean * obsWeight) / (priorWeight + obsWeight);

    const last30 = s.netBpsHistory.slice(-30);
    const last30Sum = last30.reduce((a, b) => a + b, 0);

    if (!s.active && s.totalTrades >= s.cooldownUntilTrade) {
      if (s.posteriorExpectancyBps > -2 && last30Sum > -300) s.active = true;
    } else if (s.active) {
      if (s.posteriorExpectancyBps < -8 || (n >= 20 && last30Sum < -400)) {
        s.active = false;
        s.cooldownUntilTrade = s.totalTrades + 30;
      }
    }
  }
}

function kellyFraction(t: TupleState): number {
  if (t.netBpsHistory.length < 10) return 0.005;
  const wins = t.netBpsHistory.filter((x) => x > 0);
  const losses = t.netBpsHistory.filter((x) => x <= 0);
  if (wins.length < 3 || losses.length < 3) return 0.005;
  const W = wins.reduce((a, b) => a + b, 0) / wins.length;
  const Lavg = Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length);
  if (Lavg <= 0) return 0.005;
  const p = wins.length / (wins.length + losses.length);
  const b = W / Lavg;
  const fStar = (p * b - (1 - p)) / b;
  if (fStar <= 0) return 0;
  return Math.min(fStar / 4, 0.05);
}

// ─── Backtest ────────────────────────────────────────────────

interface OpenTrade {
  tupleKey: string; asset: string; tf: TF; primitive: string;
  entryBar: number; entryTs: number; entryPrice: number;
  dir: 'long' | 'short'; stopPrice: number; tpPrice: number;
  timeStopBars: number; notional: number; riskBps: number;
}

interface ClosedTrade extends OpenTrade { exitBar: number; exitTs: number; exitPrice: number; netBps: number; netDollars: number; reason: 'stop' | 'tp' | 'time'; }

interface PortfolioState {
  equity: number; initialEquity: number; peakEquity: number; maxDrawdownPct: number;
  open: OpenTrade[]; closed: ClosedTrade[];
  dailyPnL: Map<string, number>; weeklyPnL: Map<string, number>;
  haltedUntilTs: number; consecutiveLosses: number;
}

const CFG = { initialEquity: 10000, maxConcurrent: 6, dailyHaltPct: 0.03, weeklyHaltPct: 0.08 };
function dayKey(ts: number): string { return new Date(ts).toISOString().slice(0, 10); }
function weekKey(ts: number): string {
  const d = new Date(ts); const start = new Date(d); start.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return start.toISOString().slice(0, 10);
}
function isHalted(p: PortfolioState, ts: number): boolean {
  if (ts < p.haltedUntilTs) return true;
  const dpnl = p.dailyPnL.get(dayKey(ts)) ?? 0;
  if (dpnl < -CFG.dailyHaltPct * p.initialEquity) { p.haltedUntilTs = ts + 24 * 3600 * 1000; return true; }
  const wpnl = p.weeklyPnL.get(weekKey(ts)) ?? 0;
  if (wpnl < -CFG.weeklyHaltPct * p.initialEquity) { p.haltedUntilTs = ts + 7 * 24 * 3600 * 1000; return true; }
  return false;
}

interface DataStream { asset: string; tf: TF; bars: Bar[]; ind: Indicators; }

function loadStreams(): DataStream[] {
  const out: DataStream[] = [];
  for (const a of ASSETS) {
    for (const tf of TFS) {
      const f = path.join(CACHE_DIR, `${a}_${tf}.json`);
      if (!fs.existsSync(f)) continue;
      const bars = JSON.parse(fs.readFileSync(f, 'utf8')) as Bar[];
      const ind = precompute(bars);
      out.push({ asset: a, tf, bars, ind });
    }
  }
  return out;
}

function evaluateOpenTrades(p: PortfolioState, stream: DataStream, idx: number, tuples: TupleManager) {
  const bar = stream.bars[idx];
  const remaining: OpenTrade[] = [];
  for (const o of p.open) {
    if (o.asset !== stream.asset || o.tf !== stream.tf) { remaining.push(o); continue; }
    const elapsed = idx - o.entryBar;
    let exitPrice: number | null = null;
    let reason: 'stop' | 'tp' | 'time' | null = null;
    if (o.dir === 'long') {
      if (bar.low <= o.stopPrice) { exitPrice = o.stopPrice; reason = 'stop'; }
      else if (bar.high >= o.tpPrice) { exitPrice = o.tpPrice; reason = 'tp'; }
    } else {
      if (bar.high >= o.stopPrice) { exitPrice = o.stopPrice; reason = 'stop'; }
      else if (bar.low <= o.tpPrice) { exitPrice = o.tpPrice; reason = 'tp'; }
    }
    if (!exitPrice && elapsed >= o.timeStopBars) { exitPrice = bar.close; reason = 'time'; }

    if (exitPrice && reason) {
      const grossBps = o.dir === 'long'
        ? ((exitPrice - o.entryPrice) / o.entryPrice) * 10000
        : ((o.entryPrice - exitPrice) / o.entryPrice) * 10000;
      const netBps = grossBps - COST_BPS_RT;
      const netDollars = (netBps / 10000) * o.notional;
      p.closed.push({ ...o, exitBar: idx, exitTs: bar.ts, exitPrice, netBps, netDollars, reason });
      p.equity += netDollars;
      if (p.equity > p.peakEquity) p.peakEquity = p.equity;
      const dd = (p.peakEquity - p.equity) / p.peakEquity;
      if (dd > p.maxDrawdownPct) p.maxDrawdownPct = dd;
      const dk = dayKey(bar.ts), wk = weekKey(bar.ts);
      p.dailyPnL.set(dk, (p.dailyPnL.get(dk) ?? 0) + netDollars);
      p.weeklyPnL.set(wk, (p.weeklyPnL.get(wk) ?? 0) + netDollars);
      if (netDollars < 0) p.consecutiveLosses++; else p.consecutiveLosses = 0;
      if (p.consecutiveLosses >= 5) { p.haltedUntilTs = Math.max(p.haltedUntilTs, bar.ts + 24 * 3600 * 1000); p.consecutiveLosses = 0; }
      tuples.update(o.tupleKey, netBps);
    } else {
      remaining.push(o);
    }
  }
  p.open = remaining;
}

function attemptEntry(p: PortfolioState, stream: DataStream, idx: number, tuples: TupleManager) {
  if (p.open.length >= CFG.maxConcurrent) return;
  if (isHalted(p, stream.bars[idx].ts)) return;
  if (p.open.some((o) => o.asset === stream.asset && o.tf === stream.tf)) return;

  const curRegime = stream.ind.regime[idx];
  for (const prim of PRIMITIVES) {
    if (!prim.activeRegimes.includes(curRegime)) continue;
    const sig = prim.fn(stream.bars, stream.ind, idx);
    if (!sig) continue;
    const key = `${prim.id}|${stream.asset}|${stream.tf}`;
    const ts = tuples.get(key, prim.id, stream.asset, stream.tf);
    if (!ts.active) continue;

    const a = stream.ind.atr14[idx];
    if (!isFinite(a) || a <= 0) continue;
    const stopDist = sig.stopAtr * a;
    const tpDist = sig.tpAtr * a;
    const stopPrice = sig.dir === 'long' ? sig.entryPrice - stopDist : sig.entryPrice + stopDist;
    const tpPrice = sig.dir === 'long' ? sig.entryPrice + tpDist : sig.entryPrice - tpDist;
    const riskBps = (stopDist / sig.entryPrice) * 10000;
    if (riskBps < 5 || riskBps > 800) continue;

    const fraction = kellyFraction(ts);
    if (fraction <= 0) continue;
    const notional = fraction * p.equity;

    p.open.push({
      tupleKey: key, asset: stream.asset, tf: stream.tf, primitive: prim.id,
      entryBar: idx, entryTs: stream.bars[idx].ts, entryPrice: sig.entryPrice,
      dir: sig.dir, stopPrice, tpPrice, timeStopBars: sig.timeStopBars,
      notional, riskBps,
    });
    return;
  }
}

interface StreamEvent { stream: DataStream; idx: number; ts: number; }

function buildEvents(streams: DataStream[], startTs: number, endTs: number): StreamEvent[] {
  const ev: StreamEvent[] = [];
  for (const s of streams) {
    for (let i = 200; i < s.bars.length - 1; i++) {
      const ts = s.bars[i].ts;
      if (ts < startTs || ts > endTs) continue;
      ev.push({ stream: s, idx: i, ts });
    }
  }
  ev.sort((a, b) => a.ts - b.ts);
  return ev;
}

const WARMUP_DAYS = 60;

function runBacktest(streams: DataStream[], startTs: number, endTs: number, includeWarmup = true): { state: PortfolioState; warmupEndTs: number } {
  const tuples = new TupleManager();
  const p: PortfolioState = {
    equity: CFG.initialEquity, initialEquity: CFG.initialEquity,
    peakEquity: CFG.initialEquity, maxDrawdownPct: 0,
    open: [], closed: [], dailyPnL: new Map(), weeklyPnL: new Map(),
    haltedUntilTs: 0, consecutiveLosses: 0,
  };
  const warmupEndTs = startTs + WARMUP_DAYS * 24 * 3600 * 1000;
  const ev = buildEvents(streams, startTs, endTs);
  for (const e of ev) {
    evaluateOpenTrades(p, e.stream, e.idx, tuples);
    attemptEntry(p, e.stream, e.idx, tuples);
  }
  // Force-close remaining
  for (const o of p.open) {
    const stream = streams.find((s) => s.asset === o.asset && s.tf === o.tf)!;
    const last = stream.bars[stream.bars.length - 1];
    const grossBps = o.dir === 'long'
      ? ((last.close - o.entryPrice) / o.entryPrice) * 10000
      : ((o.entryPrice - last.close) / o.entryPrice) * 10000;
    const netBps = grossBps - COST_BPS_RT;
    const netDollars = (netBps / 10000) * o.notional;
    p.closed.push({ ...o, exitBar: stream.bars.length - 1, exitTs: last.ts, exitPrice: last.close, netBps, netDollars, reason: 'time' });
    p.equity += netDollars;
  }
  p.open = [];
  return { state: p, warmupEndTs };
}

function metricsAfterWarmup(state: PortfolioState, warmupEndTs: number) {
  // Re-evaluate metrics using only post-warmup activity.
  const closed = state.closed.filter((t) => t.exitTs >= warmupEndTs);
  // Equity curve: start from CFG.initialEquity at warmupEndTs, walk through trades.
  let equity = CFG.initialEquity;
  let peak = equity;
  let maxDD = 0;
  const dailyPnL = new Map<string, number>();
  for (const t of closed) {
    equity += t.netDollars;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;
    const dk = dayKey(t.exitTs);
    dailyPnL.set(dk, (dailyPnL.get(dk) ?? 0) + t.netDollars);
  }
  return { equity, initialEquity: CFG.initialEquity, peakEquity: peak, maxDrawdownPct: maxDD, open: [], closed, dailyPnL, weeklyPnL: new Map(), haltedUntilTs: 0, consecutiveLosses: 0 } as PortfolioState;
}

function metrics(p: PortfolioState) {
  const closed = p.closed;
  const n = closed.length;
  const totalReturnPct = (p.equity - p.initialEquity) / p.initialEquity * 100;
  const dailyRet: number[] = [];
  for (const v of p.dailyPnL.values()) dailyRet.push(v / p.initialEquity);
  const dailyMean = dailyRet.length ? dailyRet.reduce((s, x) => s + x, 0) / dailyRet.length : 0;
  const dailyVar = dailyRet.length ? dailyRet.reduce((s, x) => s + (x - dailyMean) ** 2, 0) / dailyRet.length : 0;
  const dailySd = Math.sqrt(dailyVar);
  const sharpe = dailySd > 0 ? (dailyMean / dailySd) * Math.sqrt(365) : 0;
  const wins = closed.filter((t) => t.netDollars > 0);
  const winRate = n ? wins.length / n : 0;
  const losses = closed.filter((t) => t.netDollars <= 0);
  const pf = losses.length ? wins.reduce((s, t) => s + t.netDollars, 0) / Math.abs(losses.reduce((s, t) => s + t.netDollars, 0)) : (wins.length ? 99 : 0);
  const days = p.dailyPnL.size || 1;
  return {
    trades: n, days,
    trades_per_day: Math.round((n / days) * 100) / 100,
    final_equity: Math.round(p.equity),
    total_return_pct: Math.round(totalReturnPct * 100) / 100,
    max_drawdown_pct: Math.round(p.maxDrawdownPct * 10000) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    win_rate: Math.round(winRate * 1000) / 10,
    profit_factor: Math.round(pf * 100) / 100,
  };
}

function bootstrapP(returns: number[], iters = 2000): number {
  if (returns.length < 10) return 1;
  const n = returns.length;
  const m = returns.reduce((s, r) => s + r, 0) / n;
  if (m <= 0) return 1;
  const c = returns.map((r) => r - m);
  let bad = 0;
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += c[Math.floor(Math.random() * n)];
    if (s / n >= m) bad++;
  }
  return bad / iters;
}

async function main() {
  console.log('Loading streams + precomputing indicators...');
  const t0 = Date.now();
  const streams = loadStreams();
  console.log(`Loaded ${streams.length} streams in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const canon = streams.find((s) => s.asset === 'BTC-USD' && s.tf === '1H')!;
  const startTs = canon.bars[200].ts;
  const endTs = canon.bars[canon.bars.length - 1].ts;
  const span = endTs - startTs;
  console.log(`Period: ${new Date(startTs).toISOString().slice(0, 10)} → ${new Date(endTs).toISOString().slice(0, 10)}`);

  const folds: any[] = [];
  for (let k = 0; k < 4; k++) {
    const fStart = startTs + (span * k) / 4;
    const fEnd = startTs + (span * (k + 1)) / 4;
    const tStart = Date.now();
    const { state: pRaw, warmupEndTs } = runBacktest(streams, fStart, fEnd);
    const p = metricsAfterWarmup(pRaw, warmupEndTs);
    const m = metrics(p);
    const dailyRets = [...p.dailyPnL.values()];
    const bp = bootstrapP(dailyRets);
    console.log(
      `FOLD ${k + 1} ${new Date(fStart).toISOString().slice(0, 10)}→${new Date(fEnd).toISOString().slice(0, 10)} ` +
        `[${((Date.now() - tStart) / 1000).toFixed(1)}s]: ` +
        `t=${m.trades} (${m.trades_per_day}/d) ret=${m.total_return_pct}% DD=${m.max_drawdown_pct}% S=${m.sharpe} win=${m.win_rate}% PF=${m.profit_factor} p=${bp.toFixed(3)}`,
    );
    folds.push({ fold: k + 1, start: new Date(fStart).toISOString().slice(0, 10), end: new Date(fEnd).toISOString().slice(0, 10), metrics: m, bootstrap_p: Math.round(bp * 1000) / 1000 });
  }

  const tStart = Date.now();
  const { state: pFullRaw, warmupEndTs: fullWarmup } = runBacktest(streams, startTs, endTs);
  const pFull = metricsAfterWarmup(pFullRaw, fullWarmup);
  const mFull = metrics(pFull);
  const bpFull = bootstrapP([...pFull.dailyPnL.values()]);
  console.log(
    `\nFULL ${new Date(startTs).toISOString().slice(0, 10)}→${new Date(endTs).toISOString().slice(0, 10)} ` +
      `[${((Date.now() - tStart) / 1000).toFixed(1)}s]: ` +
      `t=${mFull.trades} (${mFull.trades_per_day}/d) ret=${mFull.total_return_pct}% DD=${mFull.max_drawdown_pct}% S=${mFull.sharpe} win=${mFull.win_rate}% PF=${mFull.profit_factor} p=${bpFull.toFixed(3)}`,
  );

  // Per-tuple post-mortem on full run (which tuples earned, which got disabled)
  const tFull = new TupleManager();
  // Re-run to capture tuple state at end
  // (cheap: same backtest, but we want the final tuples object)
  // Instead, replay the closed trades onto a fresh manager
  for (const t of pFull.closed) tFull.update(t.tupleKey, t.netBps);
  const tupleSummary: Array<{ key: string; trades: number; net_bps: number; active: boolean; expectancy: number }> = [];
  for (const ts of tFull.map.values()) {
    const sum = ts.netBpsHistory.reduce((a, b) => a + b, 0);
    tupleSummary.push({ key: ts.key, trades: ts.totalTrades, net_bps: Math.round(sum), active: ts.active, expectancy: Math.round(ts.posteriorExpectancyBps * 100) / 100 });
  }
  tupleSummary.sort((a, b) => b.net_bps - a.net_bps);

  console.log('\nTop 15 tuples (by net bps):');
  for (const t of tupleSummary.slice(0, 15)) console.log(`  ${t.key.padEnd(28)} t=${String(t.trades).padStart(4)} net=${String(t.net_bps).padStart(6)}bps active=${t.active} exp=${t.expectancy}`);
  console.log('\nBottom 15 tuples (by net bps):');
  for (const t of tupleSummary.slice(-15)) console.log(`  ${t.key.padEnd(28)} t=${String(t.trades).padStart(4)} net=${String(t.net_bps).padStart(6)}bps active=${t.active} exp=${t.expectancy}`);

  // Validation gates
  const allFoldsPositive = folds.every((f) => f.metrics.total_return_pct > 0);
  const allFoldsLowDD = folds.every((f) => f.metrics.max_drawdown_pct < 20);
  const fullPositive = mFull.total_return_pct > 0;
  const fullSharpeOk = mFull.sharpe > 0.8;
  const fullDDOk = mFull.max_drawdown_pct < 18;
  const pValOk = bpFull < 0.10;
  const tradesPerDayOk = mFull.trades_per_day >= 1;

  const verdict = allFoldsPositive && fullPositive && fullSharpeOk && fullDDOk && pValOk ? 'GO_PAPER' : 'NO_GO';

  const report = {
    generated_at: new Date().toISOString(),
    cost_model_rt_bps: COST_BPS_RT,
    universe: ASSETS, timeframes: TFS, primitives: PRIMITIVES.map((p) => p.id),
    config: CFG,
    folds, full_period: { metrics: mFull, bootstrap_p: Math.round(bpFull * 1000) / 1000 },
    gates: {
      all_folds_positive: allFoldsPositive,
      all_folds_low_dd: allFoldsLowDD,
      full_positive: fullPositive,
      full_sharpe_gt_0_8: fullSharpeOk,
      full_dd_lt_18: fullDDOk,
      bootstrap_p_lt_0_10: pValOk,
      trades_per_day_ge_1: tradesPerDayOk,
    },
    verdict,
    top_tuples: tupleSummary.slice(0, 30),
    bottom_tuples: tupleSummary.slice(-15),
  };

  const outDir = path.join(process.cwd(), 'docs', 'nexusone');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'V3_VALIDATION_RAW.json'), JSON.stringify(report, null, 2));

  console.log('\n━━━ GATES ━━━');
  for (const [k, v] of Object.entries(report.gates)) console.log(`  ${v ? '✓' : '✗'} ${k}`);
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`Report: docs/nexusone/V3_VALIDATION_RAW.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
