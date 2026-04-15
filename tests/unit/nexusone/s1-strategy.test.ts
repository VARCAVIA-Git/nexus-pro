import { describe, it, expect } from 'vitest';
import {
  strategyS1,
  _internals,
} from '@/lib/nexusone/strategies/s1';

const { calcFundingZScore, calcAutocorrelation, calcS1Features, evaluateS1Trigger } = _internals;

describe('S1 Strategy', () => {
  describe('manifest', () => {
    it('has correct frozen parameters', () => {
      expect(strategyS1.id).toBe('S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1');
      expect(strategyS1.version).toBe(1);
      expect(strategyS1.direction).toBe('short');
      expect(strategyS1.symbol).toBe('BTC-USD');
      expect(strategyS1.timeframe).toBe('5m');
    });

    it('has execution config', () => {
      expect(strategyS1.execution.mode).toBe('maker_first');
      expect(strategyS1.execution.max_entry_wait_bars).toBe(2);
      expect(strategyS1.execution.hold_bars).toBe(6);
    });

    it('has risk config', () => {
      expect(strategyS1.risk.max_open_positions).toBe(1);
      expect(strategyS1.risk.cooldown_bars).toBe(6);
    });
  });

  describe('calcFundingZScore', () => {
    it('returns 0 for insufficient data', () => {
      expect(calcFundingZScore([0.01, 0.02], 30)).toBe(0);
    });

    it('returns positive z-score for high current funding', () => {
      const rates = Array(29).fill(0.01);
      rates.push(0.05); // spike
      expect(calcFundingZScore(rates, 30)).toBeGreaterThan(2);
    });

    it('returns 0 for constant funding (zero variance)', () => {
      const rates = Array(30).fill(0.01);
      expect(calcFundingZScore(rates, 30)).toBeCloseTo(0, 5);
    });

    it('returns negative for low current funding', () => {
      const rates = Array(29).fill(0.01);
      rates.push(-0.03); // negative
      expect(calcFundingZScore(rates, 30)).toBeLessThan(-2);
    });
  });

  describe('calcAutocorrelation', () => {
    it('returns 0 for insufficient data', () => {
      expect(calcAutocorrelation([100, 101], 48)).toBe(0);
    });

    it('returns positive for trending prices', () => {
      // Steadily increasing prices → positive autocorrelation
      const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const ac = calcAutocorrelation(closes, 48);
      expect(ac).toBeGreaterThan(0);
    });

    it('returns ~0 or negative for mean-reverting', () => {
      // Alternating up/down → negative or zero AC
      const closes = Array.from({ length: 50 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
      const ac = calcAutocorrelation(closes, 48);
      expect(ac).toBeLessThanOrEqual(0.1);
    });
  });

  describe('evaluateS1Trigger', () => {
    it('triggers when both conditions met', () => {
      const result = evaluateS1Trigger({
        funding_zscore: 2.5,  // > 2.0
        ac1: 0.2,             // > 0.15
        close: 70000,
        funding_rate: 0.05,
      });
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('short');
      expect(result!.strategy_id).toBe(strategyS1.id);
    });

    it('does NOT trigger when funding z-score too low', () => {
      const result = evaluateS1Trigger({
        funding_zscore: 1.5,  // < 2.0
        ac1: 0.3,
        close: 70000,
        funding_rate: 0.01,
      });
      expect(result).toBeNull();
    });

    it('does NOT trigger when autocorrelation too low', () => {
      const result = evaluateS1Trigger({
        funding_zscore: 3.0,
        ac1: 0.1,             // < 0.15
        close: 70000,
        funding_rate: 0.03,
      });
      expect(result).toBeNull();
    });

    it('does NOT trigger when both below threshold', () => {
      const result = evaluateS1Trigger({
        funding_zscore: 1.0,
        ac1: 0.05,
        close: 70000,
        funding_rate: 0.005,
      });
      expect(result).toBeNull();
    });

    it('includes feature snapshot in signal', () => {
      const result = evaluateS1Trigger({
        funding_zscore: 2.5,
        ac1: 0.2,
        close: 70000,
        funding_rate: 0.05,
      });
      expect(result!.feature_snapshot.funding_zscore).toBe(2.5);
      expect(result!.feature_snapshot.ac1).toBe(0.2);
    });
  });

  describe('calcS1Features', () => {
    it('returns null for insufficient bars', () => {
      const bars = Array(10).fill(null).map((_, i) => ({
        venue: 'test', symbol: 'BTC-USD', timeframe: '5m',
        ts_open: i * 300000, ts_close: (i + 1) * 300000,
        open: 70000, high: 70100, low: 69900, close: 70000 + i * 10, volume: 100,
      }));
      expect(calcS1Features(bars, Array(30).fill(0.01))).toBeNull();
    });

    it('returns features for sufficient data', () => {
      const bars = Array(50).fill(null).map((_, i) => ({
        venue: 'test', symbol: 'BTC-USD', timeframe: '5m',
        ts_open: i * 300000, ts_close: (i + 1) * 300000,
        open: 70000, high: 70100, low: 69900, close: 70000 + i * 10, volume: 100,
      }));
      const funding = Array(30).fill(0.01);
      const features = calcS1Features(bars, funding);
      expect(features).not.toBeNull();
      expect(typeof features!.funding_zscore).toBe('number');
      expect(typeof features!.ac1).toBe('number');
    });
  });
});
