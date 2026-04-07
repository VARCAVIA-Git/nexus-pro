// ═══════════════════════════════════════════════════════════════
// Bollinger Bot — Live Integration
// Used by cron tick + live-runner to consult calibrated profiles
// for the asset being traded. Returns calibrated TP/SL + confidence.
// ═══════════════════════════════════════════════════════════════

import { redisGet } from '@/lib/db/redis';
import type { BollingerProfile } from './types';

const PROFILE_KEY = (asset: string) => `nexus:bollinger:profile:${asset}`;

export interface BollingerOverride {
  hasProfile: boolean;
  recommendation: string;
  // Confidence boost based on profile quality (added to bestSignal.confidence)
  confBoost: number;
  // Calibrated TP/SL distances as fractions of price (e.g., 0.02 = 2%)
  // Override the default ATR-based sizing if available
  tpDistPct?: number;
  slDistPct?: number;
  // Per-side stats for the requested direction
  estimatedWinRate?: number;
  expectedValue?: number;
}

/**
 * Consult the calibrated Bollinger profile for an asset and the proposed direction.
 * Returns:
 * - confBoost: 0-15% confidence boost based on recommendation tier
 * - tpDistPct/slDistPct: calibrated TP/SL distances if direction is profitable
 * - hasProfile: true if a profile exists
 *
 * If no profile exists OR recommendation is AVOID, returns no boost (live bot
 * falls back to ATR-based sizing).
 */
export async function consultBollingerProfile(
  asset: string,
  direction: 'BUY' | 'SELL' | 'NEUTRAL',
  botName?: string,
): Promise<BollingerOverride> {
  try {
    // Try multiple key variants (BTC, BTC/USD)
    const variants = [asset, asset.replace('/USD', ''), asset.replace('/', '')];
    let profile: BollingerProfile | null = null;
    for (const v of variants) {
      const p = await redisGet<BollingerProfile>(PROFILE_KEY(v));
      if (p) { profile = p; break; }
    }

    if (!profile) {
      return { hasProfile: false, recommendation: 'NONE', confBoost: 0 };
    }

    if (profile.recommendation === 'AVOID') {
      return { hasProfile: true, recommendation: 'AVOID', confBoost: 0 };
    }

    if (direction === 'NEUTRAL') {
      return { hasProfile: true, recommendation: profile.recommendation, confBoost: 0 };
    }

    const sideStats = direction === 'BUY' ? profile.long : profile.short;

    // Skip if this side has no edge (EV ≤ 0 OR too few samples)
    if (sideStats.expectedValue <= 0 || sideStats.samples < 30) {
      console.log(`[BOLLINGER]${botName ? `[${botName}]` : ''} ${asset} ${direction}: side has no edge (EV ${sideStats.expectedValue}%, ${sideStats.samples} samples) — skipping override`);
      return { hasProfile: true, recommendation: profile.recommendation, confBoost: 0 };
    }

    // Confidence boost by recommendation tier
    const confBoost =
      profile.recommendation === 'STRONG' ? 15 :
      profile.recommendation === 'GOOD' ? 10 :
      profile.recommendation === 'CAUTION' ? 5 : 0;

    // Calibrated TP/SL distances (already in percentages, convert to fractions)
    const tpDistPct = sideStats.recommendedTP / 100;
    const slDistPct = sideStats.recommendedSL / 100;

    console.log(`[BOLLINGER]${botName ? `[${botName}]` : ''} ${asset} ${direction}: profile=${profile.recommendation} → +${confBoost}% conf, TP=${sideStats.recommendedTP}% SL=${sideStats.recommendedSL}% (est WR ${sideStats.estimatedWinRate}%, EV ${sideStats.expectedValue}%)`);

    return {
      hasProfile: true,
      recommendation: profile.recommendation,
      confBoost,
      tpDistPct,
      slDistPct,
      estimatedWinRate: sideStats.estimatedWinRate,
      expectedValue: sideStats.expectedValue,
    };
  } catch (e: any) {
    console.warn(`[BOLLINGER] consultBollingerProfile error: ${e.message}`);
    return { hasProfile: false, recommendation: 'ERROR', confBoost: 0 };
  }
}
