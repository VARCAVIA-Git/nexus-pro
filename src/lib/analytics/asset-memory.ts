// ═══════════════════════════════════════════════════════════════
// Phase 6 — Asset Memory
//
// Maintains per-asset long-term memory in Redis:
//   - Rolling strategy performance (WR, PF, avg PnL per strategy)
//   - Regime history (how long in each regime)
//   - Recent decisions (last 200 signal+outcome pairs)
//   - Best performing conditions
//
// Updated incrementally on each mine close and each tick.
// Redis key: nexus:memory:{symbol}
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet } from '@/lib/db/redis';
import type {
  AssetMemory,
  StrategyPerformanceEntry,
  RegimeHistoryEntry,
  DecisionEntry,
  BestCondition,
  Mine,
  MineOutcome,
  StrategyType,
} from '@/lib/mine/types';
import type { LiveContext } from './types';
import { MINE_KEYS } from '@/lib/mine/constants';

const MEMORY_TTL_SECONDS = 30 * 24 * 3600; // 30 days
const MAX_RECENT_DECISIONS = 200;
const MAX_REGIME_HISTORY = 100;
const MAX_BEST_CONDITIONS = 20;

// ─── Load / Save ─────────────────────────────────────────────

export async function loadMemory(symbol: string): Promise<AssetMemory | null> {
  return redisGet<AssetMemory>(MINE_KEYS.assetMemory(symbol));
}

export async function saveMemory(memory: AssetMemory): Promise<void> {
  await redisSet(MINE_KEYS.assetMemory(memory.symbol), memory, MEMORY_TTL_SECONDS);
}

/** Create a fresh empty memory for an asset. */
export function createEmptyMemory(symbol: string): AssetMemory {
  return {
    symbol,
    updatedAt: Date.now(),
    strategyPerformance: {},
    regimeHistory: [],
    recentDecisions: [],
    bestConditions: [],
  };
}

// ─── Regime Tracking ─────────────────────────────────────────

/**
 * Update regime history: if regime changed, close the previous entry and open a new one.
 */
export function updateRegimeHistory(memory: AssetMemory, currentRegime: string, now: number = Date.now()): void {
  const history = memory.regimeHistory;
  const last = history.length > 0 ? history[history.length - 1] : null;

  if (last && last.regime === currentRegime && last.endedAt === null) {
    // Same regime, update duration
    last.durationMs = now - last.startedAt;
    return;
  }

  // Close previous regime
  if (last && last.endedAt === null) {
    last.endedAt = now;
    last.durationMs = now - last.startedAt;
  }

  // Open new regime
  history.push({
    regime: currentRegime,
    startedAt: now,
    endedAt: null,
    durationMs: 0,
  });

  // Trim to max
  if (history.length > MAX_REGIME_HISTORY) {
    memory.regimeHistory = history.slice(-MAX_REGIME_HISTORY);
  }

  memory.updatedAt = now;
}

// ─── Decision Recording ──────────────────────────────────────

/**
 * Record a decision (trade signal evaluation) into memory.
 */
export function recordDecision(
  memory: AssetMemory,
  decision: Omit<DecisionEntry, 'timestamp'>,
  now: number = Date.now(),
): void {
  memory.recentDecisions.push({
    ...decision,
    timestamp: now,
  });

  // Trim to max
  if (memory.recentDecisions.length > MAX_RECENT_DECISIONS) {
    memory.recentDecisions = memory.recentDecisions.slice(-MAX_RECENT_DECISIONS);
  }

  memory.updatedAt = now;
}

// ─── Strategy Performance Update ─────────────────────────────

/**
 * Update strategy performance after a mine closes.
 * Uses exponential moving average for smooth updates.
 */
export function updateStrategyPerformance(
  memory: AssetMemory,
  mine: Mine,
): void {
  if (mine.status !== 'closed' || mine.outcome == null) return;
  if (mine.entryPrice == null || mine.exitPrice == null) return;

  const strategyKey = mine.evaluatorSource ?? mine.strategy;
  const existing = memory.strategyPerformance[strategyKey];
  const multiplier = mine.direction === 'long' ? 1 : -1;
  const pnlPct = ((mine.exitPrice - mine.entryPrice) * multiplier / mine.entryPrice) * 100;
  const durationHours = mine.exitTime && mine.entryTime
    ? (mine.exitTime - mine.entryTime) / 3600_000
    : 0;
  const isWin = mine.outcome === 'tp_hit' ||
    (mine.outcome === 'trailing_exit' && pnlPct > 0);

  if (existing) {
    existing.trades += 1;
    if (isWin) existing.wins += 1;
    else existing.losses += 1;
    existing.winRate = existing.trades > 0 ? existing.wins / existing.trades : 0;

    // EMA for PnL and duration (alpha = 0.1 for smooth)
    const alpha = 0.1;
    existing.avgPnlPct = existing.avgPnlPct * (1 - alpha) + pnlPct * alpha;
    existing.avgDurationHours = existing.avgDurationHours * (1 - alpha) + durationHours * alpha;

    // Profit factor: sum wins / sum losses (approximated from avg)
    const avgWin = existing.avgPnlPct > 0 ? existing.avgPnlPct : 1;
    const avgLoss = existing.avgPnlPct < 0 ? Math.abs(existing.avgPnlPct) : 1;
    existing.profitFactor = existing.winRate > 0
      ? (existing.winRate * avgWin) / ((1 - existing.winRate) * avgLoss)
      : 0;

    existing.lastUpdated = Date.now();
  } else {
    memory.strategyPerformance[strategyKey] = {
      strategy: strategyKey,
      trades: 1,
      wins: isWin ? 1 : 0,
      losses: isWin ? 0 : 1,
      winRate: isWin ? 1 : 0,
      profitFactor: 0,
      avgPnlPct: pnlPct,
      avgDurationHours: durationHours,
      lastUpdated: Date.now(),
    };
  }

  memory.updatedAt = Date.now();
}

// ─── Best Conditions Tracking ────────────────────────────────

/**
 * After a winning mine, record its entry conditions as a "best condition".
 */
export function recordBestCondition(
  memory: AssetMemory,
  mine: Mine,
  activeConditions: string[],
): void {
  if (mine.status !== 'closed') return;
  if (mine.entryPrice == null || mine.exitPrice == null) return;

  const multiplier = mine.direction === 'long' ? 1 : -1;
  const pnlPct = ((mine.exitPrice - mine.entryPrice) * multiplier / mine.entryPrice) * 100;

  if (pnlPct <= 0 || activeConditions.length === 0) return;

  // Check if this condition set already exists
  const condKey = activeConditions.sort().join('+');
  const existing = memory.bestConditions.find(
    b => b.conditions.sort().join('+') === condKey && b.direction === mine.direction
  );

  if (existing) {
    // Update running average
    const n = existing.sampleSize;
    existing.avgPnlPct = (existing.avgPnlPct * n + pnlPct) / (n + 1);
    existing.sampleSize = n + 1;
  } else {
    memory.bestConditions.push({
      conditions: activeConditions,
      direction: mine.direction,
      avgPnlPct: pnlPct,
      sampleSize: 1,
    });
  }

  // Keep top N by avgPnlPct
  memory.bestConditions.sort((a, b) => b.avgPnlPct - a.avgPnlPct);
  if (memory.bestConditions.length > MAX_BEST_CONDITIONS) {
    memory.bestConditions = memory.bestConditions.slice(0, MAX_BEST_CONDITIONS);
  }

  memory.updatedAt = Date.now();
}

// ─── Full Tick Update ────────────────────────────────────────

/**
 * Called every tick to update regime history and save.
 */
export async function tickUpdate(symbol: string, live: LiveContext): Promise<AssetMemory> {
  let memory = await loadMemory(symbol);
  if (!memory) memory = createEmptyMemory(symbol);

  updateRegimeHistory(memory, live.regime);
  await saveMemory(memory);
  return memory;
}

/**
 * Called when a mine closes to update strategy performance and best conditions.
 */
export async function onMineClose(
  mine: Mine,
  activeConditions: string[] = [],
): Promise<void> {
  let memory = await loadMemory(mine.symbol);
  if (!memory) memory = createEmptyMemory(mine.symbol);

  updateStrategyPerformance(memory, mine);
  recordBestCondition(memory, mine, activeConditions);
  await saveMemory(memory);
}

// Export for testing
export const _internals = {
  updateRegimeHistory,
  recordDecision,
  updateStrategyPerformance,
  recordBestCondition,
};
