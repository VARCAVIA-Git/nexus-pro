import { describe, it, expect } from 'vitest';
import { _internals, evaluate, decideOrderType } from '@/lib/analytics/continuous-evaluator';
import type { EvaluatorInput } from '@/lib/analytics/continuous-evaluator';
import type { LiveContext, AnalyticReport, BacktestStrategySummary } from '@/lib/analytics/types';
import type { AssetMemory } from '@/lib/mine/types';

// ─── Helpers ─────────────────────────────────────────────────

function mockLiveContext(overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    updatedAt: Date.now(),
    price: 70000,
    regime: 'TRENDING_UP',
    activeRules: [],
    nearestZones: [],
    momentumScore: 0.3,
    volatilityPercentile: 50,
    indicators: {
      rsi: 55,
      macdHistogram: 0.5,
      bbPosition: 'UPPER_HALF',
      adx: 25,
      stochK: 60,
      atr: 500,
    },
    ...overrides,
  };
}

function mockRanking(overrides: Partial<BacktestStrategySummary> = {}): BacktestStrategySummary {
  return {
    rank: 1,
    strategyId: 'trend_1h',
    strategyName: 'Trend Following',
    timeframe: '1h',
    isMineRule: false,
    totalTrades: 100,
    winRate: 0.55,
    profitFactor: 1.8,
    netProfitPct: 15,
    maxDrawdownPct: 5,
    sharpe: 1.5,
    avgTpDistancePct: 2.5,
    avgSlDistancePct: 1.5,
    tpHitRate: 0.55,
    slHitRate: 0.45,
    avgHoldingHours: 8,
    optimalEntryTimeout: 60,
    ...overrides,
  };
}

function mockReport(rankings: BacktestStrategySummary[] = [mockRanking()]): AnalyticReport {
  return {
    symbol: 'BTC/USD',
    generatedAt: Date.now(),
    datasetCoverage: {
      timeframes: ['1h'],
      candleCounts: { '1h': 1000 },
      rangeStart: Date.now() - 365 * 86400000,
      rangeEnd: Date.now(),
    },
    globalStats: {
      avgReturnPerCandle: { '1h': 0.01 },
      volatility: { '1h': 2 },
      maxGainObserved: 10,
      maxLossObserved: -8,
      bestRegimeForLong: 'TRENDING_UP',
      bestRegimeForShort: 'TRENDING_DOWN',
    },
    topRules: [],
    reactionZones: [],
    indicatorReactivity: {},
    strategyFit: [],
    recommendedOperationMode: 'intraday',
    recommendedTimeframe: '1h',
    eventReactivity: [],
    backtestSummary: {
      generatedAt: Date.now(),
      initialCapital: 100000,
      tradeSize: 100,
      totalStrategiesTested: 5,
      totalTradesSimulated: 500,
      dateRange: { start: '2024-01-01', end: '2026-01-01' },
      rankings,
    },
  };
}

function mockInput(overrides: Partial<EvaluatorInput> = {}): EvaluatorInput {
  return {
    symbol: 'BTC/USD',
    live: mockLiveContext(),
    report: mockReport(),
    memory: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('continuous evaluator', () => {
  describe('evaluate', () => {
    it('returns noTrade when no backtest rankings', () => {
      const input = mockInput({ report: mockReport([]) });
      const result = evaluate(input);
      expect(result.shouldTrade).toBe(false);
      expect(result.reasoning).toContain('no backtest rankings available');
    });

    it('returns trade signal with trending market and good strategy', () => {
      const input = mockInput({
        live: mockLiveContext({ momentumScore: 0.4, regime: 'TRENDING_UP' }),
        report: mockReport([mockRanking({ winRate: 0.6, profitFactor: 2.0, sharpe: 1.8 })]),
      });
      const result = evaluate(input);
      expect(result.shouldTrade).toBe(true);
      expect(result.direction).toBe('long');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.tp).toBeDefined();
      expect(result.sl).toBeDefined();
    });

    it('returns noTrade when no clear direction', () => {
      const input = mockInput({
        live: mockLiveContext({ momentumScore: 0, regime: 'RANGING', activeRules: [] }),
      });
      const result = evaluate(input);
      expect(result.shouldTrade).toBe(false);
    });

    it('sets direction SHORT for bearish market', () => {
      const input = mockInput({
        live: mockLiveContext({ momentumScore: -0.4, regime: 'TRENDING_DOWN' }),
        report: mockReport([mockRanking({ winRate: 0.6, profitFactor: 2.0, sharpe: 1.8 })]),
      });
      const result = evaluate(input);
      if (result.shouldTrade) {
        expect(result.direction).toBe('short');
      }
    });

    it('uses limit order for high volatility + low momentum', () => {
      const input = mockInput({
        live: mockLiveContext({
          volatilityPercentile: 80,
          momentumScore: 0.15,  // below 0.2 → triggers limit for high vol
          regime: 'TRENDING_UP',
          // need active rules to infer direction since momentum is weak
          activeRules: [{ ruleId: 'r1', matched: true, directionBias: 'long', confidence: 70 }],
        }),
        report: mockReport([mockRanking({ winRate: 0.6, profitFactor: 2.0, sharpe: 1.8 })]),
      });
      const result = evaluate(input);
      if (result.shouldTrade) {
        expect(result.orderType).toBe('limit');
        expect(result.timeoutMs).toBeGreaterThan(0);
      }
    });

    it('uses market order for strong momentum', () => {
      const input = mockInput({
        live: mockLiveContext({ momentumScore: 0.5, regime: 'TRENDING_UP' }),
        report: mockReport([mockRanking({ winRate: 0.6, profitFactor: 2.0, sharpe: 1.8 })]),
      });
      const result = evaluate(input);
      if (result.shouldTrade) {
        expect(result.orderType).toBe('market');
      }
    });
  });

  describe('decideOrderType', () => {
    it('returns market for strong momentum', () => {
      const live = mockLiveContext({ momentumScore: 0.5 });
      expect(decideOrderType(live)).toBe('market');
    });

    it('returns limit for high vol + weak momentum', () => {
      const live = mockLiveContext({ volatilityPercentile: 80, momentumScore: 0.1 });
      expect(decideOrderType(live)).toBe('limit');
    });

    it('returns limit when near a zone', () => {
      const live = mockLiveContext({
        momentumScore: 0.1,
        volatilityPercentile: 40,
        nearestZones: [{ level: 70000, type: 'support', distancePct: 0.005, pBounce: 0.7 }],
      });
      expect(decideOrderType(live)).toBe('limit');
    });

    it('returns market by default for low vol + moderate momentum', () => {
      const live = mockLiveContext({ momentumScore: 0.2, volatilityPercentile: 30 });
      expect(decideOrderType(live)).toBe('market');
    });
  });

  describe('internal scoring', () => {
    it('backtestScore weights WR, PF, Sharpe', () => {
      const good = mockRanking({ winRate: 0.65, profitFactor: 2.5, sharpe: 2.0 });
      const bad = mockRanking({ winRate: 0.3, profitFactor: 0.8, sharpe: 0.5 });
      expect(_internals.backtestScore(good)).toBeGreaterThan(_internals.backtestScore(bad));
    });

    it('regimeAlignment boosts trend strategy in trending market', () => {
      const ranking = mockRanking({ strategyName: 'Trend Following' });
      const trendLive = mockLiveContext({ regime: 'TRENDING_UP' });
      const rangeLive = mockLiveContext({ regime: 'RANGING' });
      expect(_internals.regimeAlignment(ranking, trendLive)).toBeGreaterThan(
        _internals.regimeAlignment(ranking, rangeLive)
      );
    });

    it('inferDirection returns long for positive momentum', () => {
      const live = mockLiveContext({ momentumScore: 0.3 });
      expect(_internals.inferDirection(live, mockRanking())).toBe('long');
    });

    it('inferDirection returns short for negative momentum', () => {
      const live = mockLiveContext({ momentumScore: -0.3 });
      expect(_internals.inferDirection(live, mockRanking())).toBe('short');
    });

    it('inferDirection returns null for neutral conditions', () => {
      const live = mockLiveContext({ momentumScore: 0, regime: 'RANGING', activeRules: [] });
      expect(_internals.inferDirection(live, mockRanking())).toBeNull();
    });

    it('calculateTimeout returns longer timeout for high volatility', () => {
      expect(_internals.calculateTimeout(80)).toBeGreaterThan(_internals.calculateTimeout(20));
    });

    it('mapStrategy maps names correctly', () => {
      expect(_internals.mapStrategy('Trend Following')).toBe('trend');
      expect(_internals.mapStrategy('Mean Reversion')).toBe('reversion');
      expect(_internals.mapStrategy('Breakout Confirm')).toBe('breakout');
      expect(_internals.mapStrategy('Unknown')).toBe('trend');
    });
  });
});
