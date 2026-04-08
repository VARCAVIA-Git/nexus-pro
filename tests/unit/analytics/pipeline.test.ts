import { describe, it, expect } from 'vitest';
import type { OHLCV } from '@/types';
import { generateOHLCV } from '@/lib/core/data-generator';
import { analyzeAllCandles } from '@/lib/research/deep-mapping/candle-analyzer';
import { minePatterns } from '@/lib/research/deep-mapping/pattern-miner';

// We test the *building blocks* of the pipeline against a synthetic dataset.
// This avoids hitting the network (data-collector) and exercises:
//  - candle context generation
//  - pattern miner output shape
//  - the helpers that profile reaction zones, strategy fit, indicators

function makeCandles(n: number): OHLCV[] {
  return generateOHLCV({ startPrice: 100, days: n, annualVolatility: 0.4, seed: 42 });
}

describe('analytics pipeline — building blocks', () => {
  it('analyzeAllCandles produces contexts with required fields', () => {
    const candles = makeCandles(400);
    const ctx = analyzeAllCandles(candles);
    expect(ctx.length).toBeGreaterThan(0);
    const sample = ctx[10];
    expect(typeof sample.rsi14).toBe('number');
    expect(typeof sample.macdHistogram).toBe('number');
    expect(['BELOW_LOWER', 'AT_LOWER', 'LOWER_HALF', 'AT_MID', 'UPPER_HALF', 'AT_UPPER', 'ABOVE_UPPER']).toContain(
      sample.bbPosition,
    );
    expect(['STRONG_UP', 'UP', 'FLAT', 'DOWN', 'STRONG_DOWN']).toContain(sample.trendShort);
    expect(['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE']).toContain(sample.regime);
  });

  it('analyzeAllCandles caps at 5000 candles for RAM safety', () => {
    const candles = makeCandles(6000);
    const ctx = analyzeAllCandles(candles);
    // Returned contexts can never exceed input size; with cap=5000 and i starts at 50,
    // we expect ≤ 4950 contexts.
    expect(ctx.length).toBeLessThanOrEqual(4950);
  });

  it('minePatterns returns rules with valid shape', () => {
    const candles = makeCandles(800);
    const ctx = analyzeAllCandles(candles);
    const rules = minePatterns(ctx);
    expect(Array.isArray(rules)).toBe(true);
    if (rules.length > 0) {
      const r = rules[0];
      expect(typeof r.id).toBe('string');
      expect(Array.isArray(r.conditions)).toBe(true);
      expect(r.conditions.length).toBeGreaterThanOrEqual(2);
      expect(['BUY', 'SELL']).toContain(r.direction);
      expect(typeof r.winRate).toBe('number');
      expect(typeof r.occurrences).toBe('number');
    }
  });

  it('pattern miner returns at most 50 rules', () => {
    const candles = makeCandles(1500);
    const ctx = analyzeAllCandles(candles);
    const rules = minePatterns(ctx);
    expect(rules.length).toBeLessThanOrEqual(50);
  });

  it('contexts include forward-return ground truth on early bars', () => {
    const candles = makeCandles(300);
    const ctx = analyzeAllCandles(candles);
    // Early bars should have all 3 forward returns set; the last 24 bars are nullable.
    const first = ctx[0];
    expect(first.futureRet24h).not.toBeNull();
  });

  it('returns empty array for too-short input', () => {
    const candles = makeCandles(20);
    const ctx = analyzeAllCandles(candles);
    expect(ctx.length).toBe(0);
  });
});
