// ═══════════════════════════════════════════════════════════════
// Deep Map Signal Source for Backtester
// Loads mined rules from Redis and exposes them as a RunnableStrategy
// that the backtester can use exactly like any other strategy.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Indicators } from '@/types';
import { redisGet } from '@/lib/db/redis';
import type { RunnableStrategy } from '@/lib/research/rnd/strategy-runner';
import type { MinedRule } from '@/lib/research/deep-mapping/pattern-miner';
import type { CurrentContext } from '@/lib/research/deep-mapping/bot-integration';

// ── Bar context builder (no recompute — uses precomputed indicators) ──

export function buildBarContext(candles: OHLCV[], ind: Indicators, i: number): CurrentContext {
  const close = candles[i].close;

  // MACD signal
  const macdH = ind.macd.histogram[i] ?? 0;
  const macdHPrev = ind.macd.histogram[Math.max(0, i - 1)] ?? 0;
  const macdSignal =
    macdH > 0 && macdHPrev <= 0 ? 'CROSS_UP' :
    macdH < 0 && macdHPrev >= 0 ? 'CROSS_DOWN' :
    macdH > 0 ? 'ABOVE' : 'BELOW';

  // Bollinger position
  const lower = ind.bollinger.lower[i];
  const mid = ind.bollinger.mid[i];
  const upper = ind.bollinger.upper[i];
  let bbPosition = 'AT_MID';
  if (lower !== null && mid !== null && upper !== null) {
    if (close < lower * 0.998) bbPosition = 'BELOW_LOWER';
    else if (close < lower * 1.005) bbPosition = 'AT_LOWER';
    else if (close < mid * 0.998) bbPosition = 'LOWER_HALF';
    else if (close < mid * 1.002) bbPosition = 'AT_MID';
    else if (close < upper * 0.995) bbPosition = 'UPPER_HALF';
    else if (close < upper * 1.002) bbPosition = 'AT_UPPER';
    else bbPosition = 'ABOVE_UPPER';
  }

  // Trends — 5/20/50 bar slopes
  const slope = (window: number) => {
    if (i < window) return 0;
    const past = candles[i - window].close;
    return past > 0 ? (close - past) / past : 0;
  };
  const trendOf = (s: number) =>
    s > 0.015 ? 'STRONG_UP' :
    s > 0.003 ? 'UP' :
    s < -0.015 ? 'STRONG_DOWN' :
    s < -0.003 ? 'DOWN' : 'FLAT';
  const slope5 = slope(5);
  const slope20 = slope(20);
  const slope50 = slope(50);

  // Volume profile
  const avgVol = ind.volume.avg20[i] ?? 0;
  const volRatio = avgVol > 0 ? candles[i].volume / avgVol : 1;
  const volumeProfile =
    volRatio > 2.5 ? 'CLIMAX' :
    volRatio > 1.5 ? 'HIGH' :
    volRatio < 0.5 ? 'DRY' :
    volRatio < 0.8 ? 'LOW' : 'NORMAL';

  // Regime
  const adx = ind.adx[i] ?? 0;
  const atrPct = close > 0 ? (ind.atr[i] ?? 0) / close : 0;
  const regime =
    atrPct > 0.025 ? 'VOLATILE' :
    adx > 25 && slope20 > 0.005 ? 'TRENDING_UP' :
    adx > 25 && slope20 < -0.005 ? 'TRENDING_DOWN' : 'RANGING';

  return {
    rsi14: ind.rsi[i] ?? 50,
    macdHistogram: macdH,
    macdSignal,
    bbPosition,
    bbWidth: ind.bollinger.width[i] ?? 0,
    adx14: adx,
    stochK: ind.stochastic.k[i] ?? 50,
    stochD: ind.stochastic.d[i] ?? 50,
    trendShort: trendOf(slope5),
    trendMedium: trendOf(slope20),
    trendLong: trendOf(slope50),
    volumeProfile,
    regime,
  };
}

// ── Condition matcher (mirrors bot-integration.ts) ──

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

// ── Resolve asset key for Redis lookup ──

function normalizeAssetKey(asset: string): string {
  // Deep map stores as raw symbol (e.g. "BTC", not "BTC/USD")
  // Try multiple variants
  return asset.replace('/USD', '');
}

/**
 * Load Deep Map mined rules for an asset and return a RunnableStrategy.
 * Returns null if no rules exist or none pass the Wilson ≥ 55% threshold.
 */
export async function createDeepMapStrategy(
  asset: string,
  indicators: Indicators,
): Promise<RunnableStrategy | null> {
  // Try both with and without /USD suffix
  const variants = [asset, normalizeAssetKey(asset), asset.replace('/', '')];
  let rules: MinedRule[] | null = null;
  let usedKey = '';
  for (const v of variants) {
    const r = await redisGet<MinedRule[]>(`nexus:deepmap:rules:${v}`);
    if (r && r.length > 0) {
      rules = r;
      usedKey = v;
      break;
    }
  }

  if (!rules || rules.length === 0) {
    console.log(`[DEEPMAP-SRC] No rules found for ${asset} (tried ${variants.join(', ')})`);
    return null;
  }

  // Filter rules with direction-aware Wilson ≥ 55%
  const validRules = rules.filter(r => {
    const wilson: number = (r as any).wilson
      ?? (r.direction === 'BUY' ? r.wilsonLB : (100 - (r.wilsonLB ?? 50)));
    return wilson >= 55;
  });

  if (validRules.length === 0) {
    console.log(`[DEEPMAP-SRC] ${asset}: ${rules.length} rules total, 0 pass Wilson ≥ 55%`);
    return null;
  }

  console.log(`[DEEPMAP-SRC] ${asset}: loaded ${validRules.length}/${rules.length} rules from key '${usedKey}'`);

  return {
    name: `DeepMap[${asset}]`,
    type: 'custom',
    run: (cs: OHLCV[], i: number) => {
      if (i < 50) return { direction: 'HOLD', confidence: 0 };

      const ctx = buildBarContext(cs, indicators, i);
      let buyScore = 0;
      let sellScore = 0;
      let matches = 0;

      for (const rule of validRules) {
        const allMatch = rule.conditions.every(c => conditionMatches(c, ctx));
        if (!allMatch) continue;
        matches++;
        const wilson: number = (rule as any).wilson
          ?? (rule.direction === 'BUY' ? rule.wilsonLB : (100 - (rule.wilsonLB ?? 50)));
        const magnitude = wilson >= 75 ? 15 : wilson >= 65 ? 10 : 5;
        if (rule.direction === 'BUY') buyScore += magnitude;
        else sellScore += magnitude;
      }

      const net = buyScore - sellScore;
      // Net score is in points (5-25). Convert to confidence (50-95%).
      // 5 points → 55%, 15 points → 65%, 25+ points → 75%
      if (net >= 5) {
        return { direction: 'BUY', confidence: Math.min(95, 50 + net) };
      }
      if (net <= -5) {
        return { direction: 'SELL', confidence: Math.min(95, 50 + Math.abs(net)) };
      }
      return { direction: 'HOLD', confidence: 0 };
    },
  };
}
