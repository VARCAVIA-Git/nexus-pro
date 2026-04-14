// ═══════════════════════════════════════════════════════════════
// V2.0 — Distribution Forecaster
//
// For each state (regime + indicator conditions), computes the
// EMPIRICAL DISTRIBUTION of future returns, not just the average.
//
// Output: quantiles (p10, p30, p50, p70, p90) at 1h, 4h, 24h
// From this we derive:
//   - Skewness: is upside > downside?
//   - Optimal TP: p70 of the distribution
//   - Optimal SL: p10 of the distribution
//   - Expected value: weighted center
//   - Confidence: how tight is the distribution?
//
// This replaces binary "did it go up?" with "what's the range?"
// ═══════════════════════════════════════════════════════════════

import type { CandleContext } from '@/lib/research/deep-mapping/candle-analyzer';
import type { RegimeType, RegimeProbabilities } from './regime-detector';

// ─── Types ───────────────────────────────────────────────────

export interface QuantileDistribution {
  p10: number;   // 10th percentile (worst likely case)
  p30: number;   // 30th percentile
  p50: number;   // median
  p70: number;   // 70th percentile
  p90: number;   // 90th percentile (best likely case)
  mean: number;
  stdDev: number;
  skewness: number;     // positive = right-skewed (upside > downside)
  sampleSize: number;
}

export interface ForecastHorizons {
  h1: QuantileDistribution;    // 1 hour ahead
  h4: QuantileDistribution;    // 4 hours ahead
  h24: QuantileDistribution;   // 24 hours ahead
}

export interface TradeSetup {
  direction: 'long' | 'short' | null;
  entryPrice: number;
  optimalTp: number;       // from distribution p70 (long) or p30 (short)
  optimalSl: number;       // from distribution p10 (long) or p90 (short)
  tpPct: number;
  slPct: number;
  riskReward: number;      // TP distance / SL distance
  expectedValuePct: number; // weighted expected return
  skewness: number;        // how asymmetric is the opportunity
  confidence: number;      // 0-1 based on sample size + distribution quality
  horizon: '1h' | '4h' | '24h';
  sampleSize: number;
}

export interface DistributionProfile {
  symbol: string;
  generatedAt: number;
  totalCandles: number;
  // Per-regime distributions
  regimeDistributions: Record<string, ForecastHorizons>;
  // Per-condition-set distributions (top 20 most actionable)
  conditionDistributions: ConditionDistribution[];
}

export interface ConditionDistribution {
  conditions: string[];
  regime: RegimeType;
  direction: 'long' | 'short';
  forecast: ForecastHorizons;
  setup: TradeSetup;
}

// ─── Condition evaluators (same as pattern miner) ────────────

interface ConditionEval {
  id: string;
  test: (c: CandleContext) => boolean;
}

const CONDITIONS: ConditionEval[] = [
  { id: 'RSI<30',           test: c => c.rsi14 < 30 },
  { id: 'RSI<40',           test: c => c.rsi14 < 40 },
  { id: 'RSI>60',           test: c => c.rsi14 > 60 },
  { id: 'RSI>70',           test: c => c.rsi14 > 70 },
  { id: 'BB=AT_LOWER',      test: c => c.bbPosition === 'AT_LOWER' || c.bbPosition === 'BELOW_LOWER' },
  { id: 'BB=AT_UPPER',      test: c => c.bbPosition === 'AT_UPPER' || c.bbPosition === 'ABOVE_UPPER' },
  { id: 'MACD=POSITIVE',    test: c => c.macdHistogram > 0 },
  { id: 'MACD=NEGATIVE',    test: c => c.macdHistogram < 0 },
  { id: 'MACD=CROSS_UP',    test: c => c.macdSignal === 'CROSS_UP' },
  { id: 'MACD=CROSS_DOWN',  test: c => c.macdSignal === 'CROSS_DOWN' },
  { id: 'ADX>25',           test: c => c.adx14 > 25 },
  { id: 'ADX<15',           test: c => c.adx14 < 15 },
  { id: 'STOCH<20',         test: c => c.stochK < 20 },
  { id: 'STOCH>80',         test: c => c.stochK > 80 },
  { id: 'TREND_UP',         test: c => c.trendMedium === 'UP' || c.trendMedium === 'STRONG_UP' },
  { id: 'TREND_DOWN',       test: c => c.trendMedium === 'DOWN' || c.trendMedium === 'STRONG_DOWN' },
  { id: 'VOL_HIGH',         test: c => c.volumeProfile === 'HIGH' || c.volumeProfile === 'CLIMAX' },
  { id: 'VOL_LOW',          test: c => c.volumeProfile === 'DRY' || c.volumeProfile === 'LOW' },
];

// ─── Regime from CandleContext ───────────────────────────────

function contextRegime(c: CandleContext): RegimeType {
  if (c.regime === 'VOLATILE') return 'VOLATILE';
  if (c.regime === 'TRENDING_UP' || c.regime === 'TRENDING_DOWN') return 'TRENDING';
  return 'RANGING';
}

// ─── Core: Compute quantile distribution ─────────────────────

function computeQuantiles(values: number[]): QuantileDistribution {
  if (values.length === 0) {
    return { p10: 0, p30: 0, p50: 0, p70: 0, p90: 0, mean: 0, stdDev: 0, skewness: 0, sampleSize: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const percentile = (p: number): number => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Skewness: positive = right-skewed (more upside)
  const skewness = stdDev > 0
    ? values.reduce((s, v) => s + ((v - mean) / stdDev) ** 3, 0) / n
    : 0;

  return {
    p10: round4(percentile(10)),
    p30: round4(percentile(30)),
    p50: round4(percentile(50)),
    p70: round4(percentile(70)),
    p90: round4(percentile(90)),
    mean: round4(mean),
    stdDev: round4(stdDev),
    skewness: round4(skewness),
    sampleSize: n,
  };
}

// ─── Build distribution for a set of matching candles ────────

function buildForecast(matchingContexts: CandleContext[]): ForecastHorizons {
  const ret1h = matchingContexts.map(c => c.futureRet1h).filter((v): v is number => v !== null);
  const ret4h = matchingContexts.map(c => c.futureRet4h).filter((v): v is number => v !== null);
  const ret24h = matchingContexts.map(c => c.futureRet24h).filter((v): v is number => v !== null);

  return {
    h1: computeQuantiles(ret1h),
    h4: computeQuantiles(ret4h),
    h24: computeQuantiles(ret24h),
  };
}

// ─── Derive optimal trade setup from distribution ────────────

function deriveTradeSetup(
  dist: ForecastHorizons,
  price: number,
  conditions: string[],
): TradeSetup | null {
  // Pick the best horizon: prefer 4h (enough time for move, not too long)
  const candidates = [
    { key: '4h' as const, d: dist.h4 },
    { key: '1h' as const, d: dist.h1 },
    { key: '24h' as const, d: dist.h24 },
  ];

  for (const { key, d } of candidates) {
    if (d.sampleSize < 15) continue; // need enough data

    // Check for asymmetry: is one side much bigger than the other?
    const upside = d.p70 - d.p50;    // median to 70th percentile
    const downside = d.p50 - d.p30;  // 30th percentile to median
    const upsideExtreme = d.p90 - d.p50;
    const downsideExtreme = d.p50 - d.p10;

    // NOTE: quantile values are RATIOS (0.01 = 1%), convert to % for TP/SL
    // LONG setup: upside > downside × 1.3
    if (upside > 0 && downside > 0 && upsideExtreme / downsideExtreme > 1.3) {
      const tpPct = Math.max(0.5, d.p70 * 100);  // min 0.5% TP, convert ratio→%
      const slPct = Math.max(0.3, Math.abs(d.p10) * 100); // SL at p10, convert ratio→%
      const rr = tpPct / slPct;
      if (rr < 1.2) continue;

      const confidence = Math.min(1, d.sampleSize / 100) * Math.min(1, rr / 2);

      return {
        direction: 'long',
        entryPrice: price,
        optimalTp: round4(price * (1 + tpPct / 100)),
        optimalSl: round4(price * (1 - slPct / 100)),
        tpPct: round4(tpPct),
        slPct: round4(slPct),
        riskReward: round4(rr),
        expectedValuePct: round4(d.mean * 100),  // convert ratio→%
        skewness: d.skewness,
        confidence: round4(confidence),
        horizon: key,
        sampleSize: d.sampleSize,
      };
    }

    // SHORT setup: downside > upside × 1.3
    if (downside > 0 && upside > 0 && downsideExtreme / upsideExtreme > 1.3) {
      const tpPct = Math.max(0.5, Math.abs(d.p30) * 100);  // convert ratio→%
      const slPct = Math.max(0.3, d.p90 * 100);              // convert ratio→%
      const rr = tpPct / slPct;
      if (rr < 1.2) continue;

      const confidence = Math.min(1, d.sampleSize / 100) * Math.min(1, rr / 2);

      return {
        direction: 'short',
        entryPrice: price,
        optimalTp: round4(price * (1 - tpPct / 100)),
        optimalSl: round4(price * (1 + slPct / 100)),
        tpPct: round4(tpPct),
        slPct: round4(slPct),
        riskReward: round4(rr),
        expectedValuePct: round4(-d.mean * 100),  // convert ratio→%
        skewness: round4(-d.skewness),
        confidence: round4(confidence),
        horizon: key,
        sampleSize: d.sampleSize,
      };
    }
  }

  return null; // no asymmetric setup found
}

// ─── Main: Build full distribution profile ───────────────────

/**
 * Analyze historical CandleContexts to build distribution-based
 * forecasting profiles for each regime + condition combination.
 */
export function buildDistributionProfile(
  contexts: CandleContext[],
  symbol: string,
): DistributionProfile {
  const valid = contexts.filter(c => c.futureRet24h !== null);
  const avgPrice = valid.length > 0 ? valid.reduce((s, c) => s + c.close, 0) / valid.length : 0;

  // 1. Per-regime distributions
  const regimeGroups: Record<string, CandleContext[]> = {};
  for (const c of valid) {
    const r = contextRegime(c);
    if (!regimeGroups[r]) regimeGroups[r] = [];
    regimeGroups[r].push(c);
  }

  const regimeDistributions: Record<string, ForecastHorizons> = {};
  for (const [regime, ctxs] of Object.entries(regimeGroups)) {
    regimeDistributions[regime] = buildForecast(ctxs);
  }

  // 2. Per-condition distributions (2-condition combos)
  const conditionResults: ConditionDistribution[] = [];
  const n = CONDITIONS.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c1 = CONDITIONS[i];
      const c2 = CONDITIONS[j];

      // Group by regime
      for (const regime of ['TRENDING', 'RANGING', 'VOLATILE'] as RegimeType[]) {
        const matching = valid.filter(c =>
          c1.test(c) && c2.test(c) && contextRegime(c) === regime
        );
        if (matching.length < 15) continue; // need minimum sample

        const forecast = buildForecast(matching);
        const setup = deriveTradeSetup(forecast, avgPrice, [c1.id, c2.id]);
        if (!setup || !setup.direction) continue; // no asymmetric setup
        if (setup.riskReward < 1.3) continue; // not good enough R:R

        conditionResults.push({
          conditions: [c1.id, c2.id],
          regime,
          direction: setup.direction as 'long' | 'short',
          forecast,
          setup,
        });
      }
    }
  }

  // Sort by expected value × confidence (best opportunities first)
  conditionResults.sort((a, b) =>
    (b.setup.expectedValuePct * b.setup.confidence) -
    (a.setup.expectedValuePct * a.setup.confidence)
  );

  return {
    symbol,
    generatedAt: Date.now(),
    totalCandles: valid.length,
    regimeDistributions,
    conditionDistributions: conditionResults.slice(0, 20), // top 20
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Export for testing
export const _internals = {
  computeQuantiles,
  buildForecast,
  deriveTradeSetup,
  contextRegime,
  CONDITIONS,
};
