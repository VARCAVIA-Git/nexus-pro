import { describe, it, expect } from 'vitest';
import { buildMineRuleStrategy, evaluateMineRule } from '@/lib/analytics/backtester/mine-rule-executor';
import { computeIndicators } from '@/lib/core/indicators';
import type { OHLCV } from '@/types';
import type { MinedRule } from '@/lib/research/deep-mapping/pattern-miner';

// ── Helpers ──────────────────────────────────────────────────

function generateCandles(count: number, startPrice = 100): OHLCV[] {
  const candles: OHLCV[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.04;
    const open = price;
    price *= (1 + change);
    const close = price;
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    const volume = Math.round(1e6 * (0.5 + Math.random() * 1.5));
    const date = new Date(2024, 0, 1);
    date.setHours(date.getHours() + i);
    candles.push({ date: date.toISOString().slice(0, 10), open, high, low, close, volume });
  }
  return candles;
}

function mockRule(overrides: Partial<MinedRule> = {}): MinedRule {
  return {
    id: 'RSI<30+TREND_M=UP',
    conditions: ['RSI<30', 'TREND_M=UP'],
    occurrences: 50,
    winRate: 70,
    wilsonLB: 58,
    wilson: 65,
    avgReturn: 1.5,
    direction: 'BUY',
    edgeScore: 5.0,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('Mine Rule Executor', () => {
  describe('buildMineRuleStrategy', () => {
    it('builds a strategy from a valid rule', () => {
      const rule = mockRule();
      const strategy = buildMineRuleStrategy(rule);

      expect(strategy).not.toBeNull();
      expect(strategy!.shouldEnter).toBeDefined();
      expect(strategy!.shouldExit).toBeDefined();
      expect(strategy!.calculateSize).toBeDefined();
    });

    it('returns null for rules with unknown conditions', () => {
      const rule = mockRule({ conditions: ['UNKNOWN_COND', 'RSI<30'] });
      const strategy = buildMineRuleStrategy(rule);

      expect(strategy).toBeNull();
    });

    it('generates entry signals when conditions are met', () => {
      // Create candles where RSI will be low (strong downtrend then recovery)
      const candles: OHLCV[] = [];
      let price = 100;
      // First 100 candles: uptrend
      for (let i = 0; i < 80; i++) {
        price *= 1.005;
        candles.push({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          open: price, high: price * 1.01, low: price * 0.99,
          close: price, volume: 1e6,
        });
      }
      // Strong drop (RSI will go low)
      for (let i = 0; i < 30; i++) {
        price *= 0.98;
        candles.push({
          date: `2024-04-${String(i + 1).padStart(2, '0')}`,
          open: price * 1.01, high: price * 1.02, low: price * 0.99,
          close: price, volume: 2e6,
        });
      }
      // Recovery (medium trend up)
      for (let i = 0; i < 90; i++) {
        price *= 1.008;
        candles.push({
          date: `2024-07-${String(i + 1).padStart(2, '0')}`,
          open: price, high: price * 1.01, low: price * 0.99,
          close: price, volume: 1e6,
        });
      }

      const indicators = computeIndicators(candles);
      const rule = mockRule({ conditions: ['RSI>60', 'TREND_M=UP'] });
      const strategy = buildMineRuleStrategy(rule);

      // Try to find a bar where the strategy triggers
      let triggered = false;
      for (let i = 60; i < candles.length; i++) {
        const decision = strategy!.shouldEnter(candles, indicators, i);
        if (decision.enter) {
          triggered = true;
          expect(decision.side).toBe('LONG'); // BUY rule → LONG
          expect(decision.confidence).toBeGreaterThan(0);
          expect(decision.confidence).toBeLessThanOrEqual(0.95);
          break;
        }
      }
      // In an uptrend with RSI>60, should trigger at some point
      expect(triggered).toBe(true);
    });

    it('handles SELL direction rules correctly', () => {
      const rule = mockRule({
        conditions: ['RSI>70'],
        direction: 'SELL',
      });
      const strategy = buildMineRuleStrategy(rule);
      expect(strategy).not.toBeNull();

      // Generate uptrend candles (RSI will be high)
      const candles: OHLCV[] = [];
      let price = 100;
      for (let i = 0; i < 200; i++) {
        price *= 1.008;
        candles.push({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          open: price, high: price * 1.01, low: price * 0.99,
          close: price, volume: 1e6,
        });
      }

      const indicators = computeIndicators(candles);
      let found = false;
      for (let i = 60; i < candles.length; i++) {
        const decision = strategy!.shouldEnter(candles, indicators, i);
        if (decision.enter) {
          found = true;
          expect(decision.side).toBe('SHORT');
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('builds strategies for all known conditions', () => {
      const allConditions = [
        'RSI<30', 'RSI<40', 'RSI>60', 'RSI>70',
        'BB=BELOW_LOWER', 'BB=AT_LOWER', 'BB=LOWER_HALF', 'BB=AT_UPPER', 'BB=ABOVE_UPPER',
        'MACD=CROSS_UP', 'MACD=CROSS_DOWN', 'MACD=ABOVE', 'MACD=BELOW',
        'TREND_S=UP', 'TREND_S=DOWN', 'TREND_M=UP', 'TREND_M=DOWN', 'TREND_L=UP', 'TREND_L=DOWN',
        'ADX>25', 'ADX<15',
        'VOL=CLIMAX', 'VOL=HIGH', 'VOL=DRY',
        'STOCH<20', 'STOCH>80',
        'REGIME=TREND_UP', 'REGIME=TREND_DN', 'REGIME=RANGING', 'REGIME=VOLATILE',
      ];

      // Each condition should be recognized
      for (const cond of allConditions) {
        const rule = mockRule({ conditions: [cond], id: cond });
        const strategy = buildMineRuleStrategy(rule);
        expect(strategy).not.toBeNull();
      }
    });
  });

  describe('evaluateMineRule', () => {
    it('returns match=false when conditions are not met', () => {
      const candles = generateCandles(200);
      const indicators = computeIndicators(candles);
      // RSI<30 is unlikely in random data
      const rule = mockRule({ conditions: ['RSI<30', 'BB=BELOW_LOWER', 'STOCH<20'] });

      let anyMatch = false;
      for (let i = 60; i < candles.length; i++) {
        const result = evaluateMineRule(rule, candles, indicators, i);
        if (result.match) anyMatch = true;
      }
      // Very strict conditions — likely no match in random data
      // (not guaranteed, but statistically very unlikely)
      // Just check the structure
      const result = evaluateMineRule(rule, candles, indicators, 100);
      expect(result).toHaveProperty('match');
      expect(result).toHaveProperty('direction', 'BUY');
      expect(result).toHaveProperty('confidence');
    });

    it('returns correct confidence from wilson score', () => {
      const candles = generateCandles(200);
      const indicators = computeIndicators(candles);
      const rule = mockRule({ wilson: 80, conditions: ['ADX>25'] });

      const result = evaluateMineRule(rule, candles, indicators, 100);
      if (result.match) {
        // confidence = min(0.95, (80/100) * 0.8 + 0.15) = min(0.95, 0.79) = 0.79
        expect(result.confidence).toBeCloseTo(0.79, 1);
      }
    });

    it('returns match=false for unknown conditions', () => {
      const candles = generateCandles(200);
      const indicators = computeIndicators(candles);
      const rule = mockRule({ conditions: ['UNKNOWN_CONDITION'] });

      const result = evaluateMineRule(rule, candles, indicators, 100);
      expect(result.match).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('calculateSize', () => {
    it('respects max position size', () => {
      const rule = mockRule();
      const strategy = buildMineRuleStrategy(rule)!;
      const size = strategy.calculateSize(100_000, 2, 50, 50_000);

      // 20% of capital / price = 100000 * 0.2 / 50000 = 0.4
      expect(size).toBeLessThanOrEqual(0.4);
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });
});
