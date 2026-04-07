import { describe, it, expect } from 'vitest';
import { detectPatterns, patternScore } from '@/lib/core/patterns';
import type { OHLCV } from '@/types';

// Helper to create candles
function candle(open: number, high: number, low: number, close: number, date = '2025-01-01'): OHLCV {
  return { date, open, high, low, close, volume: 1000 };
}

describe('detectPatterns', () => {
  it('should detect bullish engulfing', () => {
    const candles: OHLCV[] = [
      candle(100, 102, 98, 98),   // bearish candle
      candle(97, 103, 96, 103),   // engulfs previous
    ];
    const patterns = detectPatterns(candles);
    const engulfing = patterns.filter((p) => p.type === 'bullish_engulfing');
    expect(engulfing.length).toBeGreaterThan(0);
    expect(engulfing[0].signal).toBe('BUY');
  });

  it('should detect bearish engulfing', () => {
    const candles: OHLCV[] = [
      candle(98, 102, 97, 102),   // bullish candle
      candle(103, 104, 96, 96),   // engulfs previous
    ];
    const patterns = detectPatterns(candles);
    const engulfing = patterns.filter((p) => p.type === 'bearish_engulfing');
    expect(engulfing.length).toBeGreaterThan(0);
    expect(engulfing[0].signal).toBe('SELL');
  });

  it('should detect doji', () => {
    const candles: OHLCV[] = [
      candle(100, 102, 98, 100),    // previous
      candle(100, 105, 95, 100.05), // doji: body/range < 0.08
    ];
    const patterns = detectPatterns(candles);
    const doji = patterns.filter((p) => p.type === 'doji');
    expect(doji.length).toBeGreaterThan(0);
    expect(doji[0].signal).toBe('NEUTRAL');
  });

  it('should detect hammer in downtrend', () => {
    const candles: OHLCV[] = [
      candle(110, 112, 108, 108, '2025-01-01'), // bar 0
      candle(108, 109, 106, 106, '2025-01-02'), // bar 1
      candle(106, 107, 104, 104, '2025-01-03'), // bar 2 - downtrend
      candle(104, 105, 103, 103, '2025-01-04'), // bar 3 - continued down
      // Hammer: small body near top, long lower shadow (>60% of range), tiny upper shadow (<10% range)
      // range = 6, body ~0.5, lower shadow ~5, upper shadow ~0.5
      candle(102.5, 103, 97, 103, '2025-01-05'),
    ];
    const patterns = detectPatterns(candles);
    const hammers = patterns.filter((p) => p.type === 'hammer');
    expect(hammers.length).toBeGreaterThan(0);
    expect(hammers[0].signal).toBe('BUY');
  });

  it('should detect morning star', () => {
    const candles: OHLCV[] = [
      candle(100, 101, 95, 96),   // large bearish
      candle(95, 96, 94.5, 95.2), // small body (doji-like)
      candle(95.5, 102, 95, 101), // large bullish, closes above midpoint of first
    ];
    const patterns = detectPatterns(candles);
    const ms = patterns.filter((p) => p.type === 'morning_star');
    expect(ms.length).toBeGreaterThan(0);
    expect(ms[0].signal).toBe('BUY');
  });

  it('should detect evening star', () => {
    const candles: OHLCV[] = [
      candle(96, 102, 95, 101),     // large bullish
      candle(101.5, 102, 101, 101.3), // small body
      candle(101, 101.5, 95, 96),   // large bearish, closes below midpoint
    ];
    const patterns = detectPatterns(candles);
    const es = patterns.filter((p) => p.type === 'evening_star');
    expect(es.length).toBeGreaterThan(0);
    expect(es[0].signal).toBe('SELL');
  });

  it('should detect piercing line', () => {
    const candles: OHLCV[] = [
      candle(105, 106, 100, 100),   // bearish
      candle(99, 104, 99, 103.5),   // opens below prev low, closes above midpoint
    ];
    const patterns = detectPatterns(candles);
    const pl = patterns.filter((p) => p.type === 'piercing_line');
    expect(pl.length).toBeGreaterThan(0);
    expect(pl[0].signal).toBe('BUY');
  });

  it('should detect dark cloud cover', () => {
    const candles: OHLCV[] = [
      candle(100, 105, 99, 105),    // bullish
      candle(106, 107, 101, 101.5), // opens above prev high, closes below midpoint
    ];
    const patterns = detectPatterns(candles);
    const dc = patterns.filter((p) => p.type === 'dark_cloud_cover');
    expect(dc.length).toBeGreaterThan(0);
    expect(dc[0].signal).toBe('SELL');
  });

  it('should return empty array for insufficient data', () => {
    const candles: OHLCV[] = [candle(100, 102, 98, 101)];
    const patterns = detectPatterns(candles);
    expect(patterns).toEqual([]);
  });
});

describe('patternScore', () => {
  it('should return NEUTRAL when no patterns at index', () => {
    const result = patternScore([], 5);
    expect(result.signal).toBe('NEUTRAL');
    expect(result.strength).toBe(0);
  });

  it('should aggregate bullish patterns into BUY signal', () => {
    const patterns = [
      { index: 5, type: 'bullish_engulfing', signal: 'BUY' as const, strength: 0.7, date: '' },
      { index: 5, type: 'hammer', signal: 'BUY' as const, strength: 0.6, date: '' },
    ];
    const result = patternScore(patterns, 5);
    expect(result.signal).toBe('BUY');
    expect(result.strength).toBeGreaterThan(0);
  });

  it('should handle mixed signals', () => {
    const patterns = [
      { index: 5, type: 'bullish_engulfing', signal: 'BUY' as const, strength: 0.7, date: '' },
      { index: 5, type: 'bearish_engulfing', signal: 'SELL' as const, strength: 0.8, date: '' },
    ];
    const result = patternScore(patterns, 5);
    // Net is -0.1, so SELL
    expect(result.signal).toBe('SELL');
  });
});
