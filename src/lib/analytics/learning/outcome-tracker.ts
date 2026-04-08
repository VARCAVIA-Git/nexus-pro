// ═══════════════════════════════════════════════════════════════
// Trade Outcome Tracker — records detailed context for every closed trade
// ═══════════════════════════════════════════════════════════════

import type { TradeOutcome } from './types';
import { redisLpush, redisLrange, KEYS } from '@/lib/db/redis';

/** Save a trade outcome to the learning store */
export async function saveOutcome(outcome: TradeOutcome): Promise<void> {
  await redisLpush(KEYS.learningOutcomes, outcome, 10000);
}

/** Load all outcomes (optionally filter by asset) */
export async function loadOutcomes(asset?: string): Promise<TradeOutcome[]> {
  const all = await redisLrange<TradeOutcome>(KEYS.learningOutcomes, 0, 9999);
  if (!asset) return all;
  return all.filter(o => o.asset === asset);
}

/** Build a TradeOutcome from trade close context */
export function buildOutcome(params: {
  tradeId: string;
  asset: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  entryTime: string;
  exitTime: Date;
  strategy: string;
  confidence: number;
  regime: string;
  indicators?: { rsi?: number; macdH?: number; adx?: number; bbWidth?: number };
  newsSentiment?: number;
  masterScore?: number;
  mtfAlignment?: string;
  nearbyEvent?: boolean;
  eventName?: string;
  patterns?: string[];
  volumeSpike?: boolean;
}): TradeOutcome {
  const entryDate = new Date(params.entryTime);
  const holdingMs = params.exitTime.getTime() - entryDate.getTime();

  return {
    id: params.tradeId,
    asset: params.asset,
    side: params.side.toLowerCase() as 'long' | 'short',
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    pnl: params.pnl,
    pnlPercent: params.entryPrice > 0 ? (params.pnl / (params.entryPrice * 1)) * 100 : 0,
    won: params.pnl > 0,
    holdingTimeMinutes: Math.round(holdingMs / 60000),
    entryContext: {
      masterScore: params.masterScore ?? 50,
      mtfAlignment: params.mtfAlignment ?? 'unknown',
      rsi: params.indicators?.rsi ?? 50,
      macd: params.indicators?.macdH ?? 0,
      adx: params.indicators?.adx ?? 0,
      bollingerPosition: (params.indicators?.bbWidth ?? 0) > 0.03 ? 'above' : 'middle',
      volumeSpike: params.volumeSpike ?? false,
      regime: params.regime,
      newsSentiment: params.newsSentiment ?? 0,
      nearbyEconomicEvent: params.nearbyEvent ?? false,
      eventName: params.eventName,
      dayOfWeek: entryDate.getDay(),
      hourOfDay: entryDate.getHours(),
      strategy: params.strategy,
      patterns: params.patterns ?? [],
    },
    timestamp: Date.now(),
  };
}
