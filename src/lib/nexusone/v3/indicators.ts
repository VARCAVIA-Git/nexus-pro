// NexusOne v3 — indicator precomputation
// Pure functions; no side effects. Same code path used by backtester and runtime.

import type { BarV3, IndicatorsV3, Regime } from './types';

export function rsiArr(c: number[], p = 14): number[] {
  const o = new Array(c.length).fill(50);
  if (c.length < p + 1) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d; else l += -d;
  }
  g /= p; l /= p;
  for (let i = p; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (p - 1) + (d > 0 ? d : 0)) / p;
    l = (l * (p - 1) + (d < 0 ? -d : 0)) / p;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
}

export function emaArr(v: number[], p: number): number[] {
  const o = new Array(v.length).fill(NaN);
  if (v.length < p) return o;
  const k = 2 / (p + 1);
  let e = v.slice(0, p).reduce((s, x) => s + x, 0) / p;
  o[p - 1] = e;
  for (let i = p; i < v.length; i++) {
    e = v[i] * k + e * (1 - k);
    o[i] = e;
  }
  return o;
}

export function smaArr(v: number[], p: number): number[] {
  const o = new Array(v.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= p) s -= v[i - p];
    if (i >= p - 1) o[i] = s / p;
  }
  return o;
}

export function stdArr(v: number[], p: number, m: number[]): number[] {
  const o = new Array(v.length).fill(NaN);
  for (let i = p - 1; i < v.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - m[i]) ** 2;
    o[i] = Math.sqrt(s / p);
  }
  return o;
}

export function atrArr(bars: BarV3[], p = 14): number[] {
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
  for (let i = p + 1; i < bars.length; i++) {
    o[i] = (o[i - 1] * (p - 1) + trs[i]) / p;
  }
  return o;
}

export function precompute(bars: BarV3[]): IndicatorsV3 {
  const closes = bars.map((b) => b.close);
  const sma20 = smaArr(closes, 20);
  const sma50 = smaArr(closes, 50);
  const e20 = emaArr(closes, 20);
  const e50 = emaArr(closes, 50);
  const e200 = emaArr(closes, 200);
  const a14 = atrArr(bars, 14);
  const r14 = rsiArr(closes, 14);

  // Per-bar regime (rolling 100-bar p90 of ATR%)
  const atrPct = a14.map((a, i) =>
    isFinite(a) && a > 0 && bars[i].close > 0 ? a / bars[i].close : NaN,
  );
  const regime: Regime[] = new Array(bars.length).fill('RANGING');
  const window: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const v = atrPct[i];
    if (!isFinite(v)) continue;
    const idx = window.findIndex((x) => x > v);
    if (idx === -1) window.push(v); else window.splice(idx, 0, v);
    if (window.length > 100) {
      const old = atrPct[i - 100];
      if (isFinite(old)) {
        const oi = window.indexOf(old);
        if (oi >= 0) window.splice(oi, 1);
      }
    }
    const p90 = window[Math.floor(window.length * 0.9)] ?? v;
    if (v > p90 * 1.0 && window.length >= 30) { regime[i] = 'VOLATILE'; continue; }
    if (!isFinite(e20[i]) || !isFinite(e50[i]) || !isFinite(e200[i])) continue;
    const sep = (Math.abs(e20[i] - e50[i]) + Math.abs(e50[i] - e200[i])) / bars[i].close;
    if (e20[i] > e50[i] && e50[i] > e200[i] && sep > 0.005) regime[i] = 'TRENDING_UP';
    else if (e20[i] < e50[i] && e50[i] < e200[i] && sep > 0.005) regime[i] = 'TRENDING_DOWN';
    else regime[i] = 'RANGING';
  }

  return {
    rsi14: r14, ema20: e20, ema50: e50, ema200: e200,
    atr14: a14, sma20, std20: stdArr(closes, 20, sma20),
    sma50, std50: stdArr(closes, 50, sma50), regime,
  };
}
