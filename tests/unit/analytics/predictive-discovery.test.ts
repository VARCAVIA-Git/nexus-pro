import { describe, it, expect } from 'vitest';
import { discoverPredictiveProfile, _internals } from '@/lib/analytics/predictive-discovery';
import type { CandleContext } from '@/lib/research/deep-mapping/candle-analyzer';

const { scanCombinations, simulate, buildTierCombinations, wilsonLB, TIER_CRITERIA, CONDITIONS } = _internals;

// ─── Helpers ─────────────────────────────────────────────────

function mockContext(overrides: Partial<CandleContext> = {}): CandleContext {
  return {
    index: 0,
    date: '2024-01-01T00:00:00Z',
    close: 70000,
    rsi14: 50,
    macdHistogram: 0,
    macdSignal: 'ABOVE',
    bbPosition: 'AT_MID',
    bbWidth: 2,
    atr14: 500,
    adx14: 20,
    stochK: 50,
    stochD: 50,
    ema9: 70000,
    ema21: 69500,
    sma50: 68000,
    sma200: 65000,
    trendShort: 'UP',
    trendMedium: 'FLAT',
    trendLong: 'UP',
    volumeProfile: 'NORMAL',
    regime: 'TRENDING_UP',
    futureRet1h: 0.5,
    futureRet4h: 1.2,
    futureRet24h: 2.5,
    futureMaxUp24h: 3.0,
    futureMaxDown24h: -1.0,
    ...overrides,
  };
}

/** Generate a series of contexts where RSI<30 + BB=AT_LOWER predicts upward moves. */
function generatePredictiveContexts(n: number): CandleContext[] {
  const contexts: CandleContext[] = [];
  for (let i = 0; i < n; i++) {
    // 40% of the time: RSI<30 + BB=AT_LOWER → strong up move
    if (i % 5 < 2) {
      contexts.push(mockContext({
        index: i,
        date: `2024-01-${String(i + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
        rsi14: 25,
        bbPosition: 'AT_LOWER',
        futureRet24h: 2.5 + Math.random() * 2,
        futureMaxUp24h: 4.0,
        futureMaxDown24h: -0.5,
      }));
    } else {
      // Rest: random conditions, mixed returns
      contexts.push(mockContext({
        index: i,
        date: `2024-01-${String(i + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
        rsi14: 40 + Math.random() * 30,
        futureRet24h: -1 + Math.random() * 3,
        futureMaxUp24h: 2.0,
        futureMaxDown24h: -2.0,
      }));
    }
  }
  return contexts;
}

// ─── Tests ───────────────────────────────────────────────────

describe('predictive discovery', () => {
  describe('wilsonLB', () => {
    it('returns 0 for empty sample', () => {
      expect(wilsonLB(0, 0)).toBe(0);
    });

    it('penalizes small samples', () => {
      // 100% WR with 5 samples should be < 100% WR with 50 samples
      expect(wilsonLB(5, 5)).toBeLessThan(wilsonLB(50, 50));
    });

    it('returns higher for more wins', () => {
      expect(wilsonLB(8, 10)).toBeGreaterThan(wilsonLB(5, 10));
    });
  });

  describe('scanCombinations', () => {
    it('returns results for matching conditions', () => {
      const contexts = generatePredictiveContexts(100);
      const results = scanCombinations(contexts, 1.0);
      expect(results.length).toBeGreaterThan(0);
    });

    it('includes both long and short directions', () => {
      const contexts = generatePredictiveContexts(100);
      const results = scanCombinations(contexts, 0.5);
      const hasLong = results.some(r => r.direction === 'long');
      const hasShort = results.some(r => r.direction === 'short');
      expect(hasLong).toBe(true);
      expect(hasShort).toBe(true);
    });
  });

  describe('simulate', () => {
    it('returns initial capital for empty returns', () => {
      const result = simulate([], []);
      expect(result.finalCapital).toBe(1000);
    });

    it('grows capital with positive returns', () => {
      const returns = Array(20).fill(2.0); // 2% return each
      const prices = Array(20).fill(70000);
      const result = simulate(returns, prices);
      expect(result.finalCapital).toBeGreaterThan(1000);
    });

    it('shrinks capital with negative returns', () => {
      const returns = Array(20).fill(-2.0);
      const prices = Array(20).fill(70000);
      const result = simulate(returns, prices);
      expect(result.finalCapital).toBeLessThan(1000);
    });

    it('tracks max drawdown', () => {
      // Spaced out enough to pass cooldown (4 bars apart)
      const returns = Array(40).fill(0).map((_, i) => {
        if (i < 8) return 3;   // first 8: profit
        if (i < 24) return -3; // next 16: loss
        return 2;              // last: recovery
      });
      const prices = Array(40).fill(70000);
      const result = simulate(returns, prices);
      expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    });
  });

  describe('discoverPredictiveProfile', () => {
    it('returns a profile with 3 tiers', () => {
      const contexts = generatePredictiveContexts(200);
      const profile = discoverPredictiveProfile(contexts, 'BTC/USD');

      expect(profile.symbol).toBe('BTC/USD');
      expect(profile.tiers.prudent).toBeDefined();
      expect(profile.tiers.moderate).toBeDefined();
      expect(profile.tiers.aggressive).toBeDefined();
      expect(profile.candlesAnalyzed).toBeGreaterThan(0);
    });

    it('aggressive tier has >= moderate >= prudent combinations', () => {
      const contexts = generatePredictiveContexts(300);
      const profile = discoverPredictiveProfile(contexts, 'BTC/USD');

      // Aggressive should find more or equal combos (less strict criteria)
      expect(profile.tiers.aggressive.combinations.length).toBeGreaterThanOrEqual(
        profile.tiers.prudent.combinations.length
      );
    });

    it('totalCombinationsTested is correct', () => {
      const contexts = generatePredictiveContexts(50);
      const profile = discoverPredictiveProfile(contexts, 'TEST');

      // C(n,2) * 2 where n = number of conditions
      const n = CONDITIONS.length;
      const expected = (n * (n - 1) / 2) * 2;
      expect(profile.totalCombinationsTested).toBe(expected);
    });

    it('all combinations have positive finalCapital', () => {
      const contexts = generatePredictiveContexts(200);
      const profile = discoverPredictiveProfile(contexts, 'BTC/USD');

      for (const tier of ['prudent', 'moderate', 'aggressive'] as const) {
        for (const combo of profile.tiers[tier].combinations) {
          expect(combo.simFinalCapital).toBeGreaterThan(1000);
        }
      }
    });
  });

  describe('tier criteria', () => {
    it('prudent has strictest criteria', () => {
      expect(TIER_CRITERIA.prudent.minWR).toBeGreaterThan(TIER_CRITERIA.moderate.minWR);
      expect(TIER_CRITERIA.moderate.minWR).toBeGreaterThan(TIER_CRITERIA.aggressive.minWR);
    });

    it('prudent requires highest PF', () => {
      expect(TIER_CRITERIA.prudent.minPF).toBeGreaterThan(TIER_CRITERIA.moderate.minPF);
      expect(TIER_CRITERIA.moderate.minPF).toBeGreaterThan(TIER_CRITERIA.aggressive.minPF);
    });
  });
});
