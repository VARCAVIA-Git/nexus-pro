// ═══════════════════════════════════════════════════════════════
// Phase 4 — Feedback Loop
//
// Saves trade outcomes when mines are closed. Used by the
// training pipeline to incorporate real trade results into
// the next retrain cycle.
// ═══════════════════════════════════════════════════════════════

import { redisLpush } from '@/lib/db/redis';
import type { Mine, TradeOutcome } from './types';
import { MINE_KEYS, MAX_HISTORY_PER_ASSET } from './constants';

/**
 * Save a closed mine's outcome as feedback for the learning loop.
 */
export async function saveFeedback(mine: Mine): Promise<void> {
  if (mine.status !== 'closed' || mine.outcome == null) return;
  if (mine.entryPrice == null || mine.exitPrice == null) return;

  const entryPrice = mine.entryPrice;
  const exitPrice = mine.exitPrice;
  const multiplier = mine.direction === 'long' ? 1 : -1;
  const pnlPct = ((exitPrice - entryPrice) * multiplier / entryPrice) * 100;
  const durationHours =
    mine.exitTime && mine.entryTime
      ? (mine.exitTime - mine.entryTime) / 3600_000
      : 0;

  const outcome: TradeOutcome = {
    mineId: mine.id,
    symbol: mine.symbol,
    strategy: mine.strategy,
    timeframe: mine.timeframe,
    direction: mine.direction,
    entryPrice,
    exitPrice,
    pnlPct,
    outcome: mine.outcome,
    durationHours,
    entrySignal: mine.entrySignal,
    closedAt: mine.exitTime ?? Date.now(),
  };

  await redisLpush(MINE_KEYS.feedback(mine.symbol), outcome, MAX_HISTORY_PER_ASSET);
}

/**
 * Get feedback outcomes for an asset (most recent first).
 */
export async function getFeedback(symbol: string, limit: number = 50): Promise<TradeOutcome[]> {
  const { redisLrange } = await import('@/lib/db/redis');
  return redisLrange<TradeOutcome>(MINE_KEYS.feedback(symbol), 0, limit - 1);
}
