// ═══════════════════════════════════════════════════════════════
// Bollinger Expert Signal Source for Backtester
// Loads calibrated BollingerProfile from Redis and exposes it
// as a RunnableStrategy that uses the asset-specific optimal parameters.
// ═══════════════════════════════════════════════════════════════

import { BollingerBands } from 'technicalindicators';
import type { OHLCV, Indicators } from '@/types';
import { redisGet } from '@/lib/db/redis';
import type { RunnableStrategy } from '@/lib/engine/rnd/strategy-runner';
import type { BollingerProfile } from '@/lib/engine/bollinger-bot/types';

const PROFILE_KEY = (asset: string) => `nexus:bollinger:profile:${asset}`;

/**
 * Load the calibrated Bollinger profile for an asset and return a RunnableStrategy
 * that emits BUY/SELL signals based on the asset's optimal BB parameters.
 */
export async function createBollingerStrategy(
  asset: string,
  candles: OHLCV[],
  _indicators: Indicators,
): Promise<RunnableStrategy | null> {
  // Try variants: BTC, BTC/USD, BTCUSD
  const variants = [asset, asset.replace('/USD', ''), asset.replace('/', '')];
  let profile: BollingerProfile | null = null;
  let usedKey = '';
  for (const v of variants) {
    const p = await redisGet<BollingerProfile>(PROFILE_KEY(v));
    if (p) { profile = p; usedKey = v; break; }
  }

  if (!profile) {
    console.log(`[BOLLINGER-SRC] No profile found for ${asset}`);
    return null;
  }

  if (profile.recommendation === 'AVOID') {
    console.log(`[BOLLINGER-SRC] ${asset}: profile is AVOID — skipping`);
    return null;
  }

  // Recompute BB with the optimal parameters for THIS asset
  const closes = candles.map(c => c.close);
  const bb = BollingerBands.calculate({
    period: profile.optimalParams.period,
    stdDev: profile.optimalParams.stdDev,
    values: closes,
  });
  const offset = closes.length - bb.length;
  const lower = new Array(offset).fill(null).concat(bb.map(b => b.lower));
  const upper = new Array(offset).fill(null).concat(bb.map(b => b.upper));

  console.log(`[BOLLINGER-SRC] ${asset}: loaded profile (key='${usedKey}', period=${profile.optimalParams.period}, stdDev=${profile.optimalParams.stdDev}, ${profile.recommendation})`);

  const longEnabled = profile.long.expectedValue > 0 && profile.long.samples >= 30;
  const shortEnabled = profile.short.expectedValue > 0 && profile.short.samples >= 30;

  // Build a confidence based on the profile's expected value (higher EV = higher conf)
  const longConf = Math.min(95, 50 + Math.round(profile.long.expectedValue * 10));
  const shortConf = Math.min(95, 50 + Math.round(profile.short.expectedValue * 10));

  return {
    name: `Bollinger[${asset}]`,
    type: 'custom',
    run: (cs: OHLCV[], i: number) => {
      if (i < 50) return { direction: 'HOLD', confidence: 0 };
      const lo = lower[i];
      const up = upper[i];
      const close = cs[i].close;

      if (longEnabled && lo !== null && close <= lo * 1.005) {
        return { direction: 'BUY', confidence: longConf };
      }
      if (shortEnabled && up !== null && close >= up * 0.995) {
        return { direction: 'SELL', confidence: shortConf };
      }
      return { direction: 'HOLD', confidence: 0 };
    },
  };
}
