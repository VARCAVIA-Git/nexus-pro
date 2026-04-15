// ═══════════════════════════════════════════════════════════════
// Phase 4 — Feedback Loop
//
// Saves trade outcomes when mines are closed. Used by the
// training pipeline to incorporate real trade results into
// the next retrain cycle.
// ═══════════════════════════════════════════════════════════════

import { redisLpush, redisGet, redisSet, redisSAdd, redisSMembers } from '@/lib/db/redis';
import type { Mine, TradeOutcome, SetupScorecard, MineOutcome } from './types';
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

  // Phase 4.5: update scorecard if AIC setup
  if (mine.aicSetupName) {
    await updateScorecard(
      mine.symbol,
      mine.aicSetupName,
      mine.outcome,
      pnlPct,
      mine.aicConfidence ?? mine.entrySignal.confidence,
    );
  }
}

/**
 * Get feedback outcomes for an asset (most recent first).
 */
export async function getFeedback(symbol: string, limit: number = 50): Promise<TradeOutcome[]> {
  const { redisLrange } = await import('@/lib/db/redis');
  return redisLrange<TradeOutcome>(MINE_KEYS.feedback(symbol), 0, limit - 1);
}

// ═══════════════════════════════════════════════════════════════
// Phase 4.5 — Signal Scorecard
// ═══════════════════════════════════════════════════════════════

/** Get a scorecard for a specific setup. */
export async function getScorecard(
  symbol: string,
  setupName: string,
): Promise<SetupScorecard | null> {
  return redisGet<SetupScorecard>(MINE_KEYS.scorecard(symbol, setupName));
}

/** Get all scorecards for a symbol. */
export async function getAllScorecards(symbol: string): Promise<SetupScorecard[]> {
  const names = await redisSMembers(MINE_KEYS.scorecardIndex(symbol));
  if (names.length === 0) return [];
  const cards = await Promise.all(
    names.map((n) => redisGet<SetupScorecard>(MINE_KEYS.scorecard(symbol, n))),
  );
  return cards.filter((c): c is SetupScorecard => c != null);
}

/** Update or create a scorecard after a mine closes. */
export async function updateScorecard(
  symbol: string,
  setupName: string,
  outcome: MineOutcome,
  pnlPct: number,
  originalConfidence: number,
): Promise<void> {
  const key = MINE_KEYS.scorecard(symbol, setupName);
  const existing = await redisGet<SetupScorecard>(key);

  const isWin =
    outcome === 'tp_hit' ||
    (outcome === 'trailing_exit' && pnlPct > 0) ||
    (outcome === 'manual' && pnlPct > 0);
  const isLoss = outcome === 'sl_hit' || (!isWin && pnlPct <= 0);
  const isTimeout = outcome === 'timeout';

  if (existing) {
    existing.total_executed += 1;
    if (isWin) existing.wins += 1;
    if (isLoss) existing.losses += 1;
    if (isTimeout) existing.timeouts += 1;

    const decided = existing.wins + existing.losses;
    existing.real_win_rate = decided > 0 ? existing.wins / decided : 0;

    // Running avg PnL
    const n = existing.total_executed;
    existing.avg_pnl_pct = (existing.avg_pnl_pct * (n - 1) + pnlPct) / n;

    // Running avg confidence
    existing.avg_confidence =
      (existing.avg_confidence * (n - 1) + originalConfidence) / n;

    // Confidence accuracy
    existing.confidence_accuracy = 1 - Math.abs(existing.avg_confidence - existing.real_win_rate);

    // Last 10 outcomes
    existing.last_10_outcomes = [...existing.last_10_outcomes, outcome].slice(-10);
    existing.last_updated = new Date().toISOString();

    await redisSet(key, existing);
  } else {
    const sc: SetupScorecard = {
      setup_name: setupName,
      symbol,
      total_signals: 0,
      total_executed: 1,
      wins: isWin ? 1 : 0,
      losses: isLoss ? 1 : 0,
      timeouts: isTimeout ? 1 : 0,
      real_win_rate: isWin ? 1 : 0,
      real_profit_factor: 0,
      avg_pnl_pct: pnlPct,
      avg_confidence: originalConfidence,
      confidence_accuracy: 0.5,
      last_updated: new Date().toISOString(),
      last_10_outcomes: [outcome],
    };
    await redisSet(key, sc);
    await redisSAdd(MINE_KEYS.scorecardIndex(symbol), setupName);
  }
}
