// ═══════════════════════════════════════════════════════════════
// Multi-Timeframe Analysis Engine
// Analyzes each asset across 5 timeframes and produces a composite score
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import type { TFKey, TimeframeAnalysis, MTFSignal, Alignment } from '@/types/intelligence';
import { computeIndicators } from '../../core/indicators';
import { fetchAllTimeframes } from './mtf-data';

const TF_WEIGHTS: Record<TFKey, number> = { '1w': 0.30, '1d': 0.25, '4h': 0.20, '1h': 0.15, '15m': 0.10 };

/** Analyze a single timeframe */
function analyzeTimeframe(candles: OHLCV[], tf: TFKey): TimeframeAnalysis | null {
  if (candles.length < 30) return null;

  const ind = computeIndicators(candles);
  const i = candles.length - 1;
  const close = candles[i].close;

  const rsi = ind.rsi[i];
  const macdH = ind.macd.histogram[i];
  const bbWidth = ind.bollinger.width[i];
  const adx = ind.adx[i];
  const stochK = ind.stochastic.k[i];
  const ema9 = ind.ema9[i];
  const ema21 = ind.ema21[i];
  const emaCross = ema9 > ema21;

  // Score each indicator as bullish(+1), bearish(-1), neutral(0)
  let score = 0;
  if (rsi > 55) score += 1; else if (rsi < 45) score -= 1;
  if (macdH > 0) score += 1; else if (macdH < 0) score -= 1;
  if (emaCross) score += 1; else score -= 1;
  if (adx > 25 && emaCross) score += 1; else if (adx > 25 && !emaCross) score -= 1;
  if (stochK > 50) score += 0.5; else if (stochK < 50) score -= 0.5;

  const maxScore = 4.5;
  const normScore = (score + maxScore) / (2 * maxScore); // 0-1
  const strength = Math.round(normScore * 100);

  let trend: TimeframeAnalysis['trend'] = 'neutral';
  if (strength > 60) trend = 'bullish';
  else if (strength < 40) trend = 'bearish';

  // Support/resistance from recent high/low
  const lookback = Math.min(20, candles.length);
  let support = Infinity, resistance = -Infinity;
  for (let j = i - lookback + 1; j <= i; j++) {
    if (j >= 0) {
      support = Math.min(support, candles[j].low);
      resistance = Math.max(resistance, candles[j].high);
    }
  }

  return {
    timeframe: tf, trend, strength,
    indicators: { rsi, macdH, bbWidth, adx, stochK, emaCross },
    support: Math.round(support * 100) / 100,
    resistance: Math.round(resistance * 100) / 100,
  };
}

/** Determine alignment of multiple timeframes */
function getAlignment(tfs: (TimeframeAnalysis | null)[]): Alignment {
  const trends = tfs.filter(Boolean).map(t => t!.trend);
  const bullish = trends.filter(t => t === 'bullish').length;
  const bearish = trends.filter(t => t === 'bearish').length;
  const total = trends.length;

  if (bullish >= total - 1 || bearish >= total - 1) return 'strong';
  if (bullish >= total * 0.6 || bearish >= total * 0.6) return 'moderate';
  if (Math.abs(bullish - bearish) <= 1) return 'conflicting';
  return 'weak';
}

/** Run full multi-timeframe analysis for an asset */
export async function runMTFAnalysis(asset: string): Promise<MTFSignal> {
  const allCandles = await fetchAllTimeframes(asset);
  const TFS: TFKey[] = ['15m', '1h', '4h', '1d', '1w'];

  const analyses: Record<string, TimeframeAnalysis | null> = {};
  for (const tf of TFS) {
    analyses[tf] = analyzeTimeframe(allCandles[tf], tf);
  }

  // Weighted composite score
  let weightedScore = 0;
  let totalWeight = 0;
  const validAnalyses: TimeframeAnalysis[] = [];

  for (const tf of TFS) {
    const a = analyses[tf];
    if (a) {
      weightedScore += a.strength * TF_WEIGHTS[tf];
      totalWeight += TF_WEIGHTS[tf];
      validAnalyses.push(a);
    }
  }

  const compositeScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;
  const alignment = getAlignment(validAnalyses);

  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  if (compositeScore > 60) direction = 'long';
  else if (compositeScore < 40) direction = 'short';

  // Suggest timeframe based on alignment
  let suggestedTimeframe: MTFSignal['suggestedTimeframe'] = 'intraday';
  if (alignment === 'strong') suggestedTimeframe = 'swing';
  else if (alignment === 'conflicting') suggestedTimeframe = 'scalp';
  else if (analyses['1w']?.trend === analyses['1d']?.trend && analyses['1d']?.trend !== 'neutral') suggestedTimeframe = 'position';

  const confidence = alignment === 'strong' ? 0.85 : alignment === 'moderate' ? 0.65 : alignment === 'weak' ? 0.45 : 0.25;

  // Fill in nulls with defaults
  const defaultTF = (tf: TFKey): TimeframeAnalysis => ({
    timeframe: tf, trend: 'neutral', strength: 50,
    indicators: { rsi: 50, macdH: 0, bbWidth: 0, adx: 0, stochK: 50, emaCross: false },
    support: 0, resistance: 0,
  });

  return {
    asset, compositeScore, alignment, direction, suggestedTimeframe, confidence,
    timeframes: {
      '15m': analyses['15m'] ?? defaultTF('15m'),
      '1h': analyses['1h'] ?? defaultTF('1h'),
      '4h': analyses['4h'] ?? defaultTF('4h'),
      '1d': analyses['1d'] ?? defaultTF('1d'),
      '1w': analyses['1w'] ?? defaultTF('1w'),
    },
  };
}
