// ═══════════════════════════════════════════════════════════════
// Deep Mapping — Bot Integration
// Live bots consult mined rules for score adjustment
// ═══════════════════════════════════════════════════════════════

import { redisGet } from '@/lib/db/redis';
import type { MinedRule } from './pattern-miner';
import type { CandleContext } from './candle-analyzer';

export interface CurrentContext {
  rsi14: number;
  macdHistogram: number;
  macdSignal: string;
  bbPosition: string;
  bbWidth: number;
  adx14: number;
  stochK: number;
  stochD?: number;
  trendShort: string;
  trendMedium: string;
  trendLong: string;
  volumeProfile: string;
  regime: string;
}

function conditionMatches(condId: string, ctx: CurrentContext): boolean {
  switch (condId) {
    case 'RSI<30': return ctx.rsi14 < 30;
    case 'RSI<40': return ctx.rsi14 < 40;
    case 'RSI>60': return ctx.rsi14 > 60;
    case 'RSI>70': return ctx.rsi14 > 70;
    case 'BB=BELOW_LOWER': return ctx.bbPosition === 'BELOW_LOWER';
    case 'BB=AT_LOWER': return ctx.bbPosition === 'AT_LOWER';
    case 'BB=LOWER_HALF': return ctx.bbPosition === 'LOWER_HALF';
    case 'BB=AT_UPPER': return ctx.bbPosition === 'AT_UPPER';
    case 'BB=ABOVE_UPPER': return ctx.bbPosition === 'ABOVE_UPPER';
    case 'MACD=CROSS_UP': return ctx.macdSignal === 'CROSS_UP';
    case 'MACD=CROSS_DOWN': return ctx.macdSignal === 'CROSS_DOWN';
    case 'MACD=ABOVE': return ctx.macdSignal === 'ABOVE';
    case 'MACD=BELOW': return ctx.macdSignal === 'BELOW';
    case 'TREND_S=UP': return ctx.trendShort === 'UP' || ctx.trendShort === 'STRONG_UP';
    case 'TREND_S=DOWN': return ctx.trendShort === 'DOWN' || ctx.trendShort === 'STRONG_DOWN';
    case 'TREND_M=UP': return ctx.trendMedium === 'UP' || ctx.trendMedium === 'STRONG_UP';
    case 'TREND_M=DOWN': return ctx.trendMedium === 'DOWN' || ctx.trendMedium === 'STRONG_DOWN';
    case 'TREND_L=UP': return ctx.trendLong === 'UP' || ctx.trendLong === 'STRONG_UP';
    case 'TREND_L=DOWN': return ctx.trendLong === 'DOWN' || ctx.trendLong === 'STRONG_DOWN';
    case 'ADX>25': return ctx.adx14 > 25;
    case 'ADX<15': return ctx.adx14 < 15;
    case 'VOL=CLIMAX': return ctx.volumeProfile === 'CLIMAX';
    case 'VOL=HIGH': return ctx.volumeProfile === 'HIGH';
    case 'VOL=DRY': return ctx.volumeProfile === 'DRY';
    case 'STOCH<20': return ctx.stochK < 20;
    case 'STOCH>80': return ctx.stochK > 80;
    case 'REGIME=TREND_UP': return ctx.regime === 'TRENDING_UP';
    case 'REGIME=TREND_DN': return ctx.regime === 'TRENDING_DOWN';
    case 'REGIME=RANGING': return ctx.regime === 'RANGING';
    case 'REGIME=VOLATILE': return ctx.regime === 'VOLATILE';
    default: return false;
  }
}

/**
 * Consult mined rules for the given asset and context.
 * Returns score adjustment: +N for BUY signals, -N for SELL signals.
 * Adjustment magnitude scales with rule WR (60% → +5, 70% → +10, 80%+ → +15).
 */
export async function consultDeepMapRules(
  asset: string,
  ctx: CurrentContext,
  botName?: string,
): Promise<number> {
  try {
    const key = `nexus:deepmap:rules:${asset}`;
    const rules = await redisGet<MinedRule[]>(key);
    if (!rules || rules.length === 0) return 0;

    let totalAdjustment = 0;
    let matchCount = 0;

    for (const rule of rules) {
      // Use Wilson lower bound (honest WR), not raw winRate
      // Old rules without wilsonLB fall back to a conservative penalty
      const honestWR = (rule as any).wilsonLB ?? Math.max(0, rule.winRate - 15);
      if (honestWR < 55) continue;
      const allMatch = rule.conditions.every(c => conditionMatches(c, ctx));
      if (!allMatch) continue;

      const magnitude = honestWR >= 75 ? 15 : honestWR >= 65 ? 10 : 5;
      const adjustment = rule.direction === 'BUY' ? magnitude : -magnitude;
      totalAdjustment += adjustment;
      matchCount++;

      console.log(`[TICK]${botName ? `[${botName}]` : ''} Deep Map rule matched: ${rule.id} → ${rule.direction} (Wilson ${honestWR.toFixed(0)}%, raw ${rule.winRate}%, ${rule.occurrences}x) adj=${adjustment > 0 ? '+' : ''}${adjustment}`);
    }

    // Cap total adjustment to ±25
    if (totalAdjustment > 25) totalAdjustment = 25;
    if (totalAdjustment < -25) totalAdjustment = -25;

    if (matchCount > 0) {
      console.log(`[TICK]${botName ? `[${botName}]` : ''} Deep Map: ${matchCount} rules matched, total adjustment ${totalAdjustment > 0 ? '+' : ''}${totalAdjustment}`);
    }

    return totalAdjustment;
  } catch (e: any) {
    console.warn(`[DEEP-MAP] consultDeepMapRules error: ${e.message}`);
    return 0;
  }
}
