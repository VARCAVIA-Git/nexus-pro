import { describe, it, expect } from 'vitest';
import { getStrategy, generateSignal, strategyMap } from '@/lib/analytics/cognition/strategies';
import { computeIndicators } from '@/lib/core/indicators';
import { generateOHLCV } from '@/lib/core/data-generator';
import type { StrategyKey, Position } from '@/types';

const candles = generateOHLCV({ startPrice: 100, days: 300, seed: 123 });
const indicators = computeIndicators(candles);

describe('Strategy interface', () => {
  const strategyKeys: StrategyKey[] = ['trend', 'reversion', 'breakout', 'momentum', 'pattern', 'combined_ai'];

  for (const key of strategyKeys) {
    describe(key, () => {
      const strategy = getStrategy(key);

      it('shouldEnter returns valid StrategyDecision', () => {
        const decision = strategy.shouldEnter(candles, indicators, 250);
        expect(typeof decision.enter).toBe('boolean');
        expect(['LONG', 'SHORT']).toContain(decision.side);
        expect(decision.confidence).toBeGreaterThanOrEqual(0);
        expect(decision.confidence).toBeLessThanOrEqual(1);
      });

      it('shouldExit returns valid ExitDecision', () => {
        const pos: Position = {
          id: 'test', symbol: 'TEST', side: 'LONG',
          entryPrice: 100, stopLoss: 95, takeProfit: 110,
          quantity: 1, sizeUsd: 100, entryIndex: 200,
          strategy: key, confidence: 0.7, regime: 'NORMAL',
        };
        const exit = strategy.shouldExit(pos, candles, indicators, 250);
        expect(typeof exit.exit).toBe('boolean');
        expect(typeof exit.reason).toBe('string');
      });

      it('calculateSize returns a non-negative number', () => {
        const size = strategy.calculateSize(10000, 5, 2, 100);
        expect(size).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(size)).toBe(true);
      });

      it('calculateSize returns 0 for zero ATR', () => {
        const size = strategy.calculateSize(10000, 5, 0, 100);
        expect(size).toBe(0);
      });
    });
  }
});

describe('generateSignal', () => {
  it('should return a valid SignalResult', () => {
    const result = generateSignal(candles, indicators, 250, 'combined_ai');
    expect(['BUY', 'SELL', 'NEUTRAL']).toContain(result.signal);
    expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(result.strength);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.regime).toBeDefined();
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.indicators).toBeDefined();
    expect(typeof result.indicators.rsi).toBe('number');
  });

  it('should produce signals for all strategy types', () => {
    const keys: StrategyKey[] = ['trend', 'reversion', 'breakout', 'momentum', 'pattern', 'combined_ai'];
    for (const key of keys) {
      const result = generateSignal(candles, indicators, 250, key);
      expect(result.strategy).toBe(key);
    }
  });
});

describe('Trend Following specifics', () => {
  it('should not enter when ADX is low', () => {
    const strategy = getStrategy('trend');
    // Check multiple bars — at least some should have low ADX
    let foundNoEntry = false;
    for (let i = 200; i < candles.length; i++) {
      const adx = indicators.adx[i];
      if (adx < 20) {
        const decision = strategy.shouldEnter(candles, indicators, i);
        if (!decision.enter) foundNoEntry = true;
      }
    }
    // At least in some low-ADX bars we shouldn't enter
    expect(foundNoEntry).toBe(true);
  });
});

describe('Breakout specifics', () => {
  it('should not enter on first 20 bars', () => {
    const strategy = getStrategy('breakout');
    const decision = strategy.shouldEnter(candles, indicators, 10);
    expect(decision.enter).toBe(false);
  });
});

describe('Combined AI', () => {
  it('confidence should be <= 0.95', () => {
    const strategy = getStrategy('combined_ai');
    for (let i = 200; i < Math.min(candles.length, 260); i++) {
      const decision = strategy.shouldEnter(candles, indicators, i);
      expect(decision.confidence).toBeLessThanOrEqual(0.95);
    }
  });
});
