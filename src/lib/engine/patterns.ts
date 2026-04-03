import type { OHLCV, PatternMatch, Signal } from '@/types';

/** Detect candlestick and chart patterns */
export function detectPatterns(candles: OHLCV[]): PatternMatch[] {
  const patterns: PatternMatch[] = [];
  const n = candles.length;

  for (let i = 2; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const pp = candles[i - 2];

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const pBody = Math.abs(p.close - p.open);

    // Hammer / Inverted Hammer
    if (range > 0 && body / range < 0.3 && (c.high - Math.max(c.open, c.close)) < body * 0.5) {
      const lowerShadow = Math.min(c.open, c.close) - c.low;
      if (lowerShadow > body * 2) {
        patterns.push({ index: i, type: 'hammer', signal: 'BUY', strength: 0.6, date: c.date });
      }
    }

    // Engulfing
    if (p.close < p.open && c.close > c.open && c.open <= p.close && c.close >= p.open) {
      patterns.push({ index: i, type: 'bullish_engulfing', signal: 'BUY', strength: 0.7, date: c.date });
    }
    if (p.close > p.open && c.close < c.open && c.open >= p.close && c.close <= p.open) {
      patterns.push({ index: i, type: 'bearish_engulfing', signal: 'SELL', strength: 0.7, date: c.date });
    }

    // Doji
    if (range > 0 && body / range < 0.1) {
      patterns.push({ index: i, type: 'doji', signal: 'NEUTRAL', strength: 0.4, date: c.date });
    }

    // Morning Star (3-candle)
    if (
      pp.close < pp.open &&
      pBody / (p.high - p.low || 1) < 0.3 &&
      c.close > c.open &&
      c.close > (pp.open + pp.close) / 2
    ) {
      patterns.push({ index: i, type: 'morning_star', signal: 'BUY', strength: 0.8, date: c.date });
    }

    // Evening Star (3-candle)
    if (
      pp.close > pp.open &&
      pBody / (p.high - p.low || 1) < 0.3 &&
      c.close < c.open &&
      c.close < (pp.open + pp.close) / 2
    ) {
      patterns.push({ index: i, type: 'evening_star', signal: 'SELL', strength: 0.8, date: c.date });
    }

    // Three White Soldiers
    if (
      i >= 3 &&
      candles[i - 2].close > candles[i - 2].open &&
      p.close > p.open &&
      c.close > c.open &&
      p.close > candles[i - 2].close &&
      c.close > p.close
    ) {
      patterns.push({ index: i, type: 'three_white_soldiers', signal: 'BUY', strength: 0.85, date: c.date });
    }

    // Three Black Crows
    if (
      i >= 3 &&
      candles[i - 2].close < candles[i - 2].open &&
      p.close < p.open &&
      c.close < c.open &&
      p.close < candles[i - 2].close &&
      c.close < p.close
    ) {
      patterns.push({ index: i, type: 'three_black_crows', signal: 'SELL', strength: 0.85, date: c.date });
    }
  }

  return patterns;
}

/** Score patterns at a given bar index */
export function patternScore(patterns: PatternMatch[], index: number): { signal: Signal; strength: number } {
  const atBar = patterns.filter((p) => p.index === index);
  if (atBar.length === 0) return { signal: 'NEUTRAL', strength: 0 };

  let score = 0;
  for (const p of atBar) {
    score += p.signal === 'BUY' ? p.strength : p.signal === 'SELL' ? -p.strength : 0;
  }

  const avgStrength = Math.min(Math.abs(score) / atBar.length, 1);
  const signal: Signal = score > 0.1 ? 'BUY' : score < -0.1 ? 'SELL' : 'NEUTRAL';
  return { signal, strength: avgStrength };
}
