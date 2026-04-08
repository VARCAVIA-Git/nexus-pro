import { describe, it, expect } from 'vitest';
import type {
  AnalyticReport,
  MinedRule,
  ReactionZone,
  StrategyFit,
  IndicatorReactivity,
} from '@/lib/analytics/types';

function validateReport(r: any): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof r?.symbol !== 'string') errors.push('symbol missing');
  if (typeof r?.generatedAt !== 'number') errors.push('generatedAt missing');
  if (!r?.datasetCoverage || typeof r.datasetCoverage !== 'object')
    errors.push('datasetCoverage missing');
  else {
    if (!Array.isArray(r.datasetCoverage.timeframes)) errors.push('timeframes not array');
    if (typeof r.datasetCoverage.candleCounts !== 'object') errors.push('candleCounts not object');
  }
  if (!r?.globalStats) errors.push('globalStats missing');
  if (!Array.isArray(r?.topRules)) errors.push('topRules not array');
  if (!Array.isArray(r?.reactionZones)) errors.push('reactionZones not array');
  if (typeof r?.indicatorReactivity !== 'object') errors.push('indicatorReactivity not object');
  if (!Array.isArray(r?.strategyFit)) errors.push('strategyFit not array');
  if (!['scalp', 'intraday', 'daily', 'swing'].includes(r?.recommendedOperationMode))
    errors.push('recommendedOperationMode invalid');
  if (!['15m', '1h', '4h', '1d'].includes(r?.recommendedTimeframe))
    errors.push('recommendedTimeframe invalid');
  if (!Array.isArray(r?.eventReactivity)) errors.push('eventReactivity not array');
  return { ok: errors.length === 0, errors };
}

function validateRule(r: MinedRule): boolean {
  return (
    typeof r.id === 'string' &&
    Array.isArray(r.conditions) &&
    (r.direction === 'long' || r.direction === 'short') &&
    typeof r.occurrences === 'number' &&
    typeof r.winRate === 'number' &&
    typeof r.avgReturn === 'number' &&
    typeof r.confidenceScore === 'number'
  );
}

function validateZone(z: ReactionZone): boolean {
  return (
    typeof z.priceLevel === 'number' &&
    (z.type === 'support' || z.type === 'resistance') &&
    typeof z.touchCount === 'number' &&
    z.bounceProbability >= 0 &&
    z.bounceProbability <= 1
  );
}

const FIXTURE: AnalyticReport = {
  symbol: 'BTC/USD',
  generatedAt: Date.now(),
  datasetCoverage: {
    timeframes: ['15m', '1h', '4h', '1d'],
    candleCounts: { '15m': 5000, '1h': 5000, '4h': 4000, '1d': 1000 },
    rangeStart: Date.now() - 365 * 86400000,
    rangeEnd: Date.now(),
  },
  globalStats: {
    avgReturnPerCandle: { '1h': 0.001, '1d': 0.005 },
    volatility: { '1h': 0.5, '1d': 1.2 },
    maxGainObserved: 18,
    maxLossObserved: -12,
    bestRegimeForLong: 'TRENDING_UP',
    bestRegimeForShort: 'TRENDING_DOWN',
  },
  topRules: [
    {
      id: 'RSI<30+BB=BELOW_LOWER',
      conditions: ['RSI<30', 'BB=BELOW_LOWER'],
      direction: 'long',
      occurrences: 50,
      winRate: 64,
      avgReturn: 1.2,
      avgWin: 2.0,
      avgLoss: 1.4,
      expectedHoldingMinutes: 1440,
      confidenceScore: 70,
    },
  ],
  reactionZones: [
    {
      priceLevel: 71500,
      type: 'support',
      strength: 80,
      touchCount: 12,
      bounceProbability: 0.7,
      breakoutProbability: 0.3,
      avgBounceMagnitude: 1.8,
      avgBreakoutMagnitude: 2.5,
      validUntil: Date.now() + 10 * 86400000,
    },
  ],
  indicatorReactivity: {
    RSI_oversold: {
      indicatorName: 'RSI_oversold',
      signalCount: 60,
      winRate: 62,
      avgReturn: 0.8,
      bestParams: {},
    },
  },
  strategyFit: [
    {
      strategyName: 'reversion',
      timeframe: '1h',
      totalTrades: 80,
      winRate: 60,
      avgReturn: 0.6,
      profitFactor: 1.5,
      sharpe: 1.2,
      maxDrawdown: 8,
      rank: 1,
    },
  ],
  recommendedOperationMode: 'intraday',
  recommendedTimeframe: '1h',
  eventReactivity: [],
};

describe('AnalyticReport schema validation', () => {
  it('accepts a fully-populated report', () => {
    const r = validateReport(FIXTURE);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects a report missing symbol', () => {
    const bad = { ...FIXTURE, symbol: undefined };
    const r = validateReport(bad);
    expect(r.ok).toBe(false);
  });

  it('rejects an invalid recommendedOperationMode', () => {
    const bad = { ...FIXTURE, recommendedOperationMode: 'wat' };
    const r = validateReport(bad);
    expect(r.ok).toBe(false);
  });

  it('rejects an invalid recommendedTimeframe', () => {
    const bad = { ...FIXTURE, recommendedTimeframe: '2h' };
    const r = validateReport(bad);
    expect(r.ok).toBe(false);
  });

  it('validates each MinedRule', () => {
    for (const r of FIXTURE.topRules) {
      expect(validateRule(r)).toBe(true);
    }
  });

  it('validates each ReactionZone', () => {
    for (const z of FIXTURE.reactionZones) {
      expect(validateZone(z)).toBe(true);
    }
  });

  it('strategyFit entries have proper numeric stats', () => {
    for (const f of FIXTURE.strategyFit as StrategyFit[]) {
      expect(typeof f.profitFactor).toBe('number');
      expect(typeof f.sharpe).toBe('number');
      expect(f.totalTrades).toBeGreaterThanOrEqual(0);
    }
  });

  it('indicatorReactivity values have name + count', () => {
    for (const v of Object.values(FIXTURE.indicatorReactivity) as IndicatorReactivity[]) {
      expect(typeof v.indicatorName).toBe('string');
      expect(v.signalCount).toBeGreaterThan(0);
    }
  });
});
