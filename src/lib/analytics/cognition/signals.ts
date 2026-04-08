import type { OHLCV, StrategyKey, SignalResult, SignalStrength, Regime } from '@/types';
import { computeIndicators, detectRegime } from '../../core/indicators';
import { generateSignal } from './strategies';
import { generateAssetOHLCV } from '../../core/data-generator';

// ═══════════════════════════════════════════════════════════════
// SIGNAL GENERATOR
// Combines indicators + patterns + regime detection for each asset
// ═══════════════════════════════════════════════════════════════

export interface GeneratedSignal {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: SignalStrength;
  confidence: number;
  strategy: string;
  price: number;
  regime: Regime;
  time: string;
  indicators: Record<string, number>;
}

/** Generate real-time signals for a list of assets */
export function generateSignalsForAssets(
  symbols: string[],
  strategies: StrategyKey[] = ['combined_ai'],
): GeneratedSignal[] {
  const signals: GeneratedSignal[] = [];
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  for (const symbol of symbols) {
    // Generate 250 days of data for proper indicator warmup
    const seed = hashCode(symbol + now.toISOString().slice(0, 10));
    const candles = generateAssetOHLCV(symbol, 250, '2025-06-01', seed);

    if (candles.length < 60) continue;

    const indicators = computeIndicators(candles);
    const lastIndex = candles.length - 1;
    const currentPrice = candles[lastIndex].close;

    // Run each active strategy and pick the best signal
    let bestSignal: SignalResult | null = null;
    let bestConf = -1;

    for (const stratKey of strategies) {
      const result = generateSignal(candles, indicators, lastIndex, stratKey);
      if (result.confidence > bestConf) {
        bestConf = result.confidence;
        bestSignal = result;
      }
    }

    if (bestSignal) {
      signals.push({
        symbol,
        signal: bestSignal.signal,
        strength: bestSignal.strength,
        confidence: bestSignal.confidence,
        strategy: bestSignal.strategy,
        price: currentPrice,
        regime: bestSignal.regime,
        time: timeStr,
        indicators: bestSignal.indicators,
      });
    }
  }

  // Sort by confidence descending
  signals.sort((a, b) => b.confidence - a.confidence);
  return signals;
}

/** Generate a signal summary for the dashboard */
export function generateSignalSummary(symbols: string[]) {
  const signals = generateSignalsForAssets(symbols);
  const buys = signals.filter((s) => s.signal === 'BUY');
  const sells = signals.filter((s) => s.signal === 'SELL');
  const neutrals = signals.filter((s) => s.signal === 'NEUTRAL');

  return {
    total: signals.length,
    buys: buys.length,
    sells: sells.length,
    neutrals: neutrals.length,
    strongBuys: signals.filter((s) => s.strength === 'strong_buy').length,
    strongSells: signals.filter((s) => s.strength === 'strong_sell').length,
    avgConfidence: signals.length > 0
      ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length
      : 0,
    signals,
  };
}

// Simple string hash for seed
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
