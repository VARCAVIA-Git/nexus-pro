import { describe, it, expect } from 'vitest';
import { generateNarrative } from '@/lib/analytics/narrative';
import type {
  AnalyticReport,
  LiveContext,
  NewsDigest,
  MacroEvent,
  EventImpactStat,
} from '@/lib/analytics/types';

function makeReport(overrides: Partial<AnalyticReport> = {}): AnalyticReport {
  return {
    symbol: 'BTC/USD',
    generatedAt: Date.now(),
    datasetCoverage: { timeframes: [], candleCounts: {}, rangeStart: 0, rangeEnd: 0 },
    globalStats: {
      avgReturnPerCandle: {},
      volatility: {},
      maxGainObserved: 0,
      maxLossObserved: 0,
      bestRegimeForLong: '',
      bestRegimeForShort: '',
    },
    topRules: [],
    reactionZones: [],
    indicatorReactivity: {},
    strategyFit: [],
    recommendedOperationMode: 'intraday',
    recommendedTimeframe: '1h',
    eventReactivity: [],
    ...overrides,
  };
}

function makeLive(regime: string): LiveContext {
  return {
    updatedAt: Date.now(),
    price: 73000,
    regime,
    activeRules: [],
    nearestZones: [],
    momentumScore: 0,
    volatilityPercentile: 50,
  };
}

describe('generateNarrative — Phase 3.7', () => {
  it('1) bull regime + top rule + reliable fit → 3 frasi + disclaimer', () => {
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport({
        topRules: [
          {
            id: 'A',
            conditions: ['RSI<30', 'BB=BELOW_LOWER'],
            direction: 'long',
            occurrences: 50,
            winRate: 72,
            avgReturn: 1.8,
            avgWin: 2.5,
            avgLoss: 1.0,
            expectedHoldingMinutes: 1440,
            confidenceScore: 80,
          },
        ],
        strategyFit: [
          {
            strategyName: 'reversion',
            timeframe: '1h',
            totalTrades: 50,
            winRate: 60,
            avgReturn: 0.8,
            profitFactor: 2.4,
            sharpe: 1.5,
            maxDrawdown: 8,
            rank: 1,
          },
        ],
      }),
      liveContext: makeLive('TRENDING_UP'),
    });
    expect(text).toContain('BTC/USD');
    expect(text).toContain('tendenza chiara al rialzo');
    expect(text).toContain('RSI sotto 30');
    expect(text).toContain('reversion');
    expect(text).toContain('Profit Factor ottimo'); // PF 2.4 → ottimo
    expect(text).toContain('non garantiscono'); // disclaimer
  });

  it('2) bear regime: ribasso → frase ribassista', () => {
    const text = generateNarrative({
      symbol: 'ETH/USD',
      report: makeReport({
        topRules: [
          {
            id: 'B',
            conditions: ['RSI>70', 'BB=ABOVE_UPPER'],
            direction: 'short',
            occurrences: 30,
            winRate: 65,
            avgReturn: -1.2,
            avgWin: 0,
            avgLoss: 0,
            expectedHoldingMinutes: 1440,
            confidenceScore: 65,
          },
        ],
      }),
      liveContext: makeLive('TRENDING_DOWN'),
    });
    expect(text).toContain('tendenza chiara al ribasso');
    expect(text).toContain('è sceso del 1.20%');
  });

  it('3) range/laterale: regime ranging', () => {
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport(),
      liveContext: makeLive('RANGING'),
    });
    expect(text).toContain('canale laterale');
  });

  it('4) volatile: fase volatile', () => {
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport(),
      liveContext: makeLive('VOLATILE'),
    });
    expect(text).toContain('fase volatile');
  });

  it('5) breakout: rottura livelli', () => {
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport(),
      liveContext: makeLive('BREAKOUT'),
    });
    expect(text).toContain('rompendo i livelli');
  });

  it('6) missing-data: tutto null → fallback graceful', () => {
    const text = generateNarrative({
      symbol: 'XYZ/USD',
      report: null,
    });
    expect(text).toContain('XYZ/USD');
    expect(text).toContain('non ci sono ancora abbastanza dati');
    expect(text).toContain('non garantiscono');
  });

  it('7) macro event upcoming with historical impact', () => {
    const now = Date.now();
    const events: MacroEvent[] = [
      {
        id: 'fomc-1',
        name: 'FOMC Statement',
        country: 'USD',
        scheduledAt: now + 6 * 60 * 60 * 1000, // 6h
        importance: 'high',
        actual: null,
        forecast: null,
        previous: null,
      },
    ];
    const impacts: EventImpactStat[] = [
      { eventName: 'FOMC Statement', direction: 'up', avgReturn24h: 1.4, winRate: 70, sampleSize: 8 },
    ];
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport(),
      liveContext: makeLive('TRENDING_UP'),
      macroEvents: events,
      eventImpacts: impacts,
    });
    expect(text).toContain('FOMC Statement');
    expect(text).toContain('tra circa 6 ore');
    expect(text).toContain('al rialzo');
    expect(text).toContain('+1.40%');
    expect(text).toContain('n=8');
  });

  it('8) news sentiment positive ≥ 0.2 produces a sentence', () => {
    const news: NewsDigest = {
      symbol: 'BTC/USD',
      window: '24h',
      updatedAt: Date.now(),
      count: 12,
      avgSentiment: 0.34,
      topItems: [],
      sentimentDelta24h: 0.05,
    };
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport(),
      liveContext: makeLive('TRENDING_UP'),
      newsDigest: news,
    });
    expect(text).toContain('sentiment delle ultime 24 ore');
    expect(text).toContain('positivo');
  });

  it('9) news sentiment near zero is omitted', () => {
    const news: NewsDigest = {
      symbol: 'BTC/USD',
      window: '24h',
      updatedAt: Date.now(),
      count: 12,
      avgSentiment: 0.05,
      topItems: [],
      sentimentDelta24h: 0,
    };
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport(),
      liveContext: makeLive('TRENDING_UP'),
      newsDigest: news,
    });
    expect(text).not.toContain('sentiment delle ultime 24 ore');
  });

  it('10) macro event past 48h is ignored', () => {
    const now = Date.now();
    const events: MacroEvent[] = [
      {
        id: 'far',
        name: 'CPI',
        country: 'USD',
        scheduledAt: now + 5 * 24 * 60 * 60 * 1000, // 5 days
        importance: 'high',
        actual: null,
        forecast: null,
        previous: null,
      },
    ];
    const text = generateNarrative({
      symbol: 'BTC/USD',
      report: makeReport(),
      liveContext: makeLive('TRENDING_UP'),
      macroEvents: events,
    });
    expect(text).not.toContain('CPI');
  });
});
