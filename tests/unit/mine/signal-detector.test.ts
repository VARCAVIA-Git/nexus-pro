import { describe, it, expect } from 'vitest';
import { detectSignals, _internals } from '@/lib/mine/signal-detector';
import type { SignalDetectorInput } from '@/lib/mine/signal-detector';
import type { LiveContext, AnalyticReport, NewsDigest, MacroEvent } from '@/lib/analytics/types';

// ─── Factories ────────────────────────────────────────────────

function mockLive(overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    updatedAt: Date.now(),
    price: 70000,
    regime: 'RANGING',
    activeRules: [],
    nearestZones: [],
    momentumScore: 0,
    volatilityPercentile: 50,
    ...overrides,
  };
}

function mockReport(overrides: Partial<AnalyticReport> = {}): AnalyticReport {
  return {
    symbol: 'BTC/USD',
    generatedAt: Date.now(),
    datasetCoverage: { timeframes: ['1h'], candleCounts: { '1h': 1000 }, rangeStart: 0, rangeEnd: 0, lastCandleTimestamp: 0 },
    globalStats: {} as any,
    topRules: [],
    reactionZones: [],
    indicatorReactivity: {},
    strategyFit: [
      {
        strategyName: 'reversion',
        timeframe: '1h',
        totalTrades: 50,
        winRate: 0.6,
        avgReturn: 2.5,
        profitFactor: 1.8,
        sharpe: 1.2,
        maxDrawdown: 5,
        rank: 1,
      },
      {
        strategyName: 'trend',
        timeframe: '4h',
        totalTrades: 30,
        winRate: 0.55,
        avgReturn: 3.0,
        profitFactor: 1.5,
        sharpe: 0.9,
        maxDrawdown: 8,
        rank: 2,
      },
    ],
    recommendedOperationMode: 'intraday',
    recommendedTimeframe: '1h',
    eventReactivity: [],
    ...overrides,
  };
}

function mockInput(overrides: Partial<SignalDetectorInput> = {}): SignalDetectorInput {
  return {
    symbol: 'BTC/USD',
    live: mockLive(),
    report: mockReport(),
    news: null,
    macroEvents: [],
    activeMineDirections: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('signal-detector', () => {
  describe('zone_bounce', () => {
    it('detects long signal near support with high pBounce', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            nearestZones: [
              { level: 69000, type: 'support', distancePct: -0.015, pBounce: 0.75 },
            ],
          }),
        }),
      );
      const zb = signals.find((s) => s.signal.type === 'zone_bounce');
      expect(zb).toBeDefined();
      expect(zb!.suggestedDirection).toBe('long');
      expect(zb!.suggestedStrategy).toBe('reversion');
      expect(zb!.signal.confidence).toBeGreaterThan(0.5);
      expect(zb!.signal.sourceZone).toBe(69000);
    });

    it('detects short signal near resistance', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            nearestZones: [
              { level: 71000, type: 'resistance', distancePct: 0.014, pBounce: 0.8 },
            ],
          }),
        }),
      );
      const zb = signals.find((s) => s.signal.type === 'zone_bounce');
      expect(zb).toBeDefined();
      expect(zb!.suggestedDirection).toBe('short');
    });

    it('no signal if zone too far', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            nearestZones: [
              { level: 65000, type: 'support', distancePct: -0.07, pBounce: 0.9 },
            ],
          }),
        }),
      );
      expect(signals.find((s) => s.signal.type === 'zone_bounce')).toBeUndefined();
    });

    it('no signal if pBounce too low', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            nearestZones: [
              { level: 69800, type: 'support', distancePct: -0.003, pBounce: 0.4 },
            ],
          }),
        }),
      );
      expect(signals.find((s) => s.signal.type === 'zone_bounce')).toBeUndefined();
    });
  });

  describe('trend_continuation', () => {
    it('detects long signal in uptrend with positive momentum', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            regime: 'TRENDING_UP',
            momentumScore: 0.6,
          }),
        }),
      );
      const tc = signals.find((s) => s.signal.type === 'trend_continuation');
      expect(tc).toBeDefined();
      expect(tc!.suggestedDirection).toBe('long');
      expect(tc!.suggestedStrategy).toBe('trend');
    });

    it('detects short signal in downtrend', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            regime: 'TRENDING_DOWN',
            momentumScore: -0.5,
          }),
        }),
      );
      const tc = signals.find((s) => s.signal.type === 'trend_continuation');
      expect(tc).toBeDefined();
      expect(tc!.suggestedDirection).toBe('short');
    });

    it('no signal in ranging market', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            regime: 'RANGING',
            momentumScore: 0.1,
          }),
        }),
      );
      expect(signals.find((s) => s.signal.type === 'trend_continuation')).toBeUndefined();
    });

    it('no signal if momentum contradicts regime', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            regime: 'TRENDING_UP',
            momentumScore: -0.5, // contradicts
          }),
        }),
      );
      expect(signals.find((s) => s.signal.type === 'trend_continuation')).toBeUndefined();
    });
  });

  describe('pattern_match', () => {
    it('detects signal from matched active rule', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            activeRules: [
              { ruleId: 'rule-1', matched: true, directionBias: 'long', confidence: 0.7 },
            ],
          }),
        }),
      );
      const pm = signals.find((s) => s.signal.type === 'pattern_match');
      expect(pm).toBeDefined();
      expect(pm!.signal.sourcePattern).toBe('rule-1');
      expect(pm!.suggestedDirection).toBe('long');
    });

    it('no signal if rule not matched', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            activeRules: [
              { ruleId: 'rule-1', matched: false, directionBias: 'long', confidence: 0.8 },
            ],
          }),
        }),
      );
      expect(signals.find((s) => s.signal.type === 'pattern_match')).toBeUndefined();
    });

    it('no signal if confidence too low', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            activeRules: [
              { ruleId: 'rule-1', matched: true, directionBias: 'long', confidence: 0.1 },
            ],
          }),
        }),
      );
      expect(signals.find((s) => s.signal.type === 'pattern_match')).toBeUndefined();
    });
  });

  describe('filters', () => {
    it('macro blackout discards all signals', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            nearestZones: [
              { level: 69500, type: 'support', distancePct: -0.007, pBounce: 0.8 },
            ],
          }),
          macroEvents: [
            {
              id: 'ev-1',
              name: 'CPI',
              country: 'US',
              scheduledAt: Date.now() + 60 * 60 * 1000, // 1h from now
              importance: 'high',
              actual: null,
              forecast: 3.0,
              previous: 2.9,
            },
          ],
        }),
      );
      expect(signals.length).toBe(0);
    });

    it('negative news filters out long signals', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            nearestZones: [
              { level: 69500, type: 'support', distancePct: -0.007, pBounce: 0.8 },
            ],
          }),
          news: {
            symbol: 'BTC/USD',
            window: '24h',
            updatedAt: Date.now(),
            count: 5,
            avgSentiment: -0.5, // very negative
            topItems: [],
            sentimentDelta24h: -0.2,
          },
        }),
      );
      expect(signals.find((s) => s.suggestedDirection === 'long')).toBeUndefined();
    });

    it('conflicting mine direction filters signal', () => {
      const signals = detectSignals(
        mockInput({
          live: mockLive({
            regime: 'TRENDING_UP',
            momentumScore: 0.6,
          }),
          activeMineDirections: ['short'], // conflict with long signal
        }),
      );
      expect(signals.find((s) => s.suggestedDirection === 'long')).toBeUndefined();
    });
  });

  describe('isMacroBlackout', () => {
    it('returns true when high-impact event within 2h', () => {
      expect(
        _internals.isMacroBlackout([
          { id: '1', name: 'NFP', country: 'US', scheduledAt: Date.now() + 3600_000, importance: 'high', actual: null, forecast: null, previous: null },
        ]),
      ).toBe(true);
    });

    it('returns false when event is low impact', () => {
      expect(
        _internals.isMacroBlackout([
          { id: '1', name: 'Speech', country: 'US', scheduledAt: Date.now() + 3600_000, importance: 'low', actual: null, forecast: null, previous: null },
        ]),
      ).toBe(false);
    });

    it('returns false when event is past', () => {
      expect(
        _internals.isMacroBlackout([
          { id: '1', name: 'CPI', country: 'US', scheduledAt: Date.now() - 3600_000, importance: 'high', actual: 3.0, forecast: 3.0, previous: 2.9 },
        ]),
      ).toBe(false);
    });
  });

  it('signals are sorted by confidence descending', () => {
    const signals = detectSignals(
      mockInput({
        live: mockLive({
          regime: 'TRENDING_UP',
          momentumScore: 0.6,
          activeRules: [
            { ruleId: 'rule-1', matched: true, directionBias: 'long', confidence: 0.9 },
          ],
          nearestZones: [
            { level: 69500, type: 'support', distancePct: -0.007, pBounce: 0.65 },
          ],
        }),
      }),
    );
    expect(signals.length).toBeGreaterThan(1);
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].signal.confidence).toBeGreaterThanOrEqual(signals[i].signal.confidence);
    }
  });
});
