import type { OHLCV, PatternMatch, Signal } from '@/types';

// ── Single-candle helpers ─────────────────────────────────
function bodySize(c: OHLCV): number { return Math.abs(c.close - c.open); }
function range(c: OHLCV): number { return c.high - c.low; }
function isBullish(c: OHLCV): boolean { return c.close > c.open; }
function isBearish(c: OHLCV): boolean { return c.close < c.open; }
function upperShadow(c: OHLCV): number { return c.high - Math.max(c.open, c.close); }
function lowerShadow(c: OHLCV): number { return Math.min(c.open, c.close) - c.low; }

/** Detect all candlestick and chart patterns in an OHLCV array */
export function detectPatterns(candles: OHLCV[]): PatternMatch[] {
  const patterns: PatternMatch[] = [];
  const n = candles.length;

  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const r = range(c);
    const b = bodySize(c);

    if (r === 0) continue;
    const bodyRatio = b / r;
    const ls = lowerShadow(c);
    const us = upperShadow(c);

    // ── Hammer ────────────────────────────────────────
    // Small body at top, long lower shadow (>60% of range), small upper shadow (<10% range)
    if (bodyRatio < 0.35 && ls > r * 0.6 && us < r * 0.1 && i >= 3) {
      const downtrend = candles[i - 1].close < candles[i - 3].close;
      if (downtrend) {
        patterns.push({ index: i, type: 'hammer', signal: 'BUY', strength: 0.65, date: c.date });
      }
    }

    // ── Inverted Hammer ──────────────────────────────
    // Small body at bottom, long upper shadow (>60% range), small lower shadow
    if (bodyRatio < 0.35 && us > r * 0.6 && ls < r * 0.1 && i >= 3) {
      const downtrend = candles[i - 1].close < candles[i - 3].close;
      if (downtrend) {
        patterns.push({ index: i, type: 'inverted_hammer', signal: 'BUY', strength: 0.55, date: c.date });
      }
    }

    // ── Shooting Star ────────────────────────────────
    // Small body at bottom, long upper shadow (>60% range), small lower shadow, preceding uptrend
    if (bodyRatio < 0.35 && us > r * 0.6 && ls < r * 0.1 && i >= 3) {
      const uptrend = candles[i - 1].close > candles[i - 3].close;
      if (uptrend) {
        patterns.push({ index: i, type: 'shooting_star', signal: 'SELL', strength: 0.65, date: c.date });
      }
    }

    // ── Doji ──────────────────────────────────────────
    if (bodyRatio < 0.08 && r > 0) {
      patterns.push({ index: i, type: 'doji', signal: 'NEUTRAL', strength: 0.4, date: c.date });
    }

    // ── Bullish Engulfing ─────────────────────────────
    if (isBearish(p) && isBullish(c) && c.open <= p.close && c.close >= p.open && bodySize(c) > bodySize(p)) {
      patterns.push({ index: i, type: 'bullish_engulfing', signal: 'BUY', strength: 0.75, date: c.date });
    }

    // ── Bearish Engulfing ─────────────────────────────
    if (isBullish(p) && isBearish(c) && c.open >= p.close && c.close <= p.open && bodySize(c) > bodySize(p)) {
      patterns.push({ index: i, type: 'bearish_engulfing', signal: 'SELL', strength: 0.75, date: c.date });
    }

    // ── Piercing Line ─────────────────────────────────
    // Bearish candle followed by bullish that opens below prev low and closes above midpoint
    if (isBearish(p) && isBullish(c) && c.open < p.low) {
      const midpoint = (p.open + p.close) / 2;
      if (c.close > midpoint && c.close < p.open) {
        patterns.push({ index: i, type: 'piercing_line', signal: 'BUY', strength: 0.65, date: c.date });
      }
    }

    // ── Dark Cloud Cover ──────────────────────────────
    // Bullish candle followed by bearish that opens above prev high and closes below midpoint
    if (isBullish(p) && isBearish(c) && c.open > p.high) {
      const midpoint = (p.open + p.close) / 2;
      if (c.close < midpoint && c.close > p.open) {
        patterns.push({ index: i, type: 'dark_cloud_cover', signal: 'SELL', strength: 0.65, date: c.date });
      }
    }

    // ── 3-candle patterns (need i >= 2) ──────────────
    if (i >= 2) {
      const pp = candles[i - 2];
      const pBody = bodySize(p);
      const pRange = range(p);
      const ppBody = bodySize(pp);

      // ── Morning Star ───────────────────────────────
      if (
        isBearish(pp) && ppBody > 0 &&
        pRange > 0 && pBody / pRange < 0.3 &&
        isBullish(c) && c.close > (pp.open + pp.close) / 2
      ) {
        patterns.push({ index: i, type: 'morning_star', signal: 'BUY', strength: 0.8, date: c.date });
      }

      // ── Evening Star ───────────────────────────────
      if (
        isBullish(pp) && ppBody > 0 &&
        pRange > 0 && pBody / pRange < 0.3 &&
        isBearish(c) && c.close < (pp.open + pp.close) / 2
      ) {
        patterns.push({ index: i, type: 'evening_star', signal: 'SELL', strength: 0.8, date: c.date });
      }

      // ── Three White Soldiers ───────────────────────
      if (
        isBullish(pp) && isBullish(p) && isBullish(c) &&
        p.close > pp.close && c.close > p.close &&
        p.open > pp.open && c.open > p.open
      ) {
        patterns.push({ index: i, type: 'three_white_soldiers', signal: 'BUY', strength: 0.85, date: c.date });
      }

      // ── Three Black Crows ──────────────────────────
      if (
        isBearish(pp) && isBearish(p) && isBearish(c) &&
        p.close < pp.close && c.close < p.close &&
        p.open < pp.open && c.open < p.open
      ) {
        patterns.push({ index: i, type: 'three_black_crows', signal: 'SELL', strength: 0.85, date: c.date });
      }
    }
  }

  // ── Double Top / Double Bottom (lookback 50 candles) ───
  if (n >= 50) {
    const lookback = Math.min(50, n);
    const start = n - lookback;
    const slice = candles.slice(start);

    // Find local peaks and troughs
    const peaks: number[] = [];
    const troughs: number[] = [];
    for (let j = 2; j < slice.length - 2; j++) {
      const h = slice[j].high;
      if (h > slice[j - 1].high && h > slice[j - 2].high && h > slice[j + 1].high && h > slice[j + 2].high) {
        peaks.push(j);
      }
      const l = slice[j].low;
      if (l < slice[j - 1].low && l < slice[j - 2].low && l < slice[j + 1].low && l < slice[j + 2].low) {
        troughs.push(j);
      }
    }

    // Double Top: two peaks at similar price level
    for (let a = 0; a < peaks.length - 1; a++) {
      for (let b = a + 1; b < peaks.length; b++) {
        const h1 = slice[peaks[a]].high;
        const h2 = slice[peaks[b]].high;
        const diff = Math.abs(h1 - h2) / Math.max(h1, h2);
        if (diff < 0.02 && peaks[b] - peaks[a] >= 5) {
          const globalIdx = start + peaks[b];
          if (globalIdx === n - 1 || peaks[b] === slice.length - 3) {
            patterns.push({
              index: globalIdx,
              type: 'double_top',
              signal: 'SELL',
              strength: 0.7,
              date: candles[globalIdx].date,
            });
          }
        }
      }
    }

    // Double Bottom: two troughs at similar price level
    for (let a = 0; a < troughs.length - 1; a++) {
      for (let b = a + 1; b < troughs.length; b++) {
        const l1 = slice[troughs[a]].low;
        const l2 = slice[troughs[b]].low;
        const diff = Math.abs(l1 - l2) / Math.max(l1, l2);
        if (diff < 0.02 && troughs[b] - troughs[a] >= 5) {
          const globalIdx = start + troughs[b];
          if (globalIdx === n - 1 || troughs[b] === slice.length - 3) {
            patterns.push({
              index: globalIdx,
              type: 'double_bottom',
              signal: 'BUY',
              strength: 0.7,
              date: candles[globalIdx].date,
            });
          }
        }
      }
    }
  }

  return patterns;
}

/** Score patterns at a given bar index — aggregate all patterns */
export function patternScore(patterns: PatternMatch[], index: number): { signal: Signal; strength: number } {
  const atBar = patterns.filter((p) => p.index === index);
  if (atBar.length === 0) return { signal: 'NEUTRAL', strength: 0 };

  let score = 0;
  for (const p of atBar) {
    score += p.signal === 'BUY' ? p.strength : p.signal === 'SELL' ? -p.strength : 0;
  }

  const avgStrength = Math.min(Math.abs(score) / Math.max(atBar.length, 1), 1);
  const signal: Signal = score > 0.1 ? 'BUY' : score < -0.1 ? 'SELL' : 'NEUTRAL';
  return { signal, strength: avgStrength };
}
