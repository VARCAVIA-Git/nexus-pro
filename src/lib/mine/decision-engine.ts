// ═══════════════════════════════════════════════════════════════
// Phase 4 — Decision Engine
//
// Takes DetectedSignals + portfolio state → MineAction[]
// Handles both:
//   1. Opening new mines (from signals)
//   2. Managing existing mines (TP/SL/trailing/timeout)
// ═══════════════════════════════════════════════════════════════

import type {
  Mine,
  MineAction,
  CapitalProfile,
  DetectedSignal,
} from './types';
import type { LiveContext } from '@/lib/analytics/types';
import { isTpHit, isSlHit, isTimedOut, calcUnrealizedPnlPct } from './utils';
import { checkRisk } from './risk-manager';

// ─── Monitor existing mines ───────────────────────────────────

/**
 * Check all active mines against current prices and produce
 * close/adjust actions.
 */
export function monitorMines(
  mines: Mine[],
  liveContexts: Map<string, LiveContext>,
  profile: CapitalProfile,
): MineAction[] {
  const actions: MineAction[] = [];

  for (const mine of mines) {
    if (mine.status !== 'open') continue;

    const live = liveContexts.get(mine.symbol);
    if (!live?.price) continue;

    const currentPrice = live.price;

    // 1. TP hit
    if (isTpHit(mine, currentPrice)) {
      actions.push({ type: 'close_mine', mineId: mine.id, reason: 'tp_hit' });
      continue;
    }

    // 2. SL hit
    if (isSlHit(mine, currentPrice)) {
      actions.push({ type: 'close_mine', mineId: mine.id, reason: 'sl_hit' });
      continue;
    }

    // 3. Timeout
    if (isTimedOut(mine)) {
      actions.push({ type: 'close_mine', mineId: mine.id, reason: 'timeout' });
      continue;
    }

    // 4. Trailing stop logic
    if (mine.entryPrice != null) {
      const pnlPct = calcUnrealizedPnlPct(mine, currentPrice);

      // Check if trailing stop should be activated
      if (
        mine.trailingStopPct == null &&
        pnlPct >= profile.trailingStopActivationPct
      ) {
        // Activate trailing: set new SL at current price minus trailing distance
        const trailingDistance =
          currentPrice * (profile.trailingStopDistancePct / 100);
        const newSl =
          mine.direction === 'long'
            ? currentPrice - trailingDistance
            : currentPrice + trailingDistance;

        // Only tighten SL, never loosen
        const shouldAdjust =
          mine.direction === 'long'
            ? newSl > mine.stopLoss
            : newSl < mine.stopLoss;

        if (shouldAdjust) {
          actions.push({ type: 'adjust_sl', mineId: mine.id, newSl });
        }
      }

      // Check if trailing stop already active and price pulled back
      if (mine.trailingStopPct != null) {
        const trailingDistance =
          mine.maxUnrealizedPnl > 0
            ? (mine.entryPrice * mine.trailingStopPct) / 100
            : (currentPrice * profile.trailingStopDistancePct) / 100;

        // For long: SL follows price up; for short: SL follows price down
        if (mine.direction === 'long') {
          const highWater = mine.entryPrice + mine.maxUnrealizedPnl / mine.quantity;
          const trailingSl = highWater - trailingDistance;
          if (currentPrice <= trailingSl) {
            actions.push({ type: 'close_mine', mineId: mine.id, reason: 'trailing_exit' });
          }
        } else {
          const highWater = mine.entryPrice - mine.maxUnrealizedPnl / mine.quantity;
          const trailingSl = highWater + trailingDistance;
          if (currentPrice >= trailingSl) {
            actions.push({ type: 'close_mine', mineId: mine.id, reason: 'trailing_exit' });
          }
        }
      }
    }
  }

  return actions;
}

// ─── Evaluate new signals ─────────────────────────────────────

/**
 * Evaluate detected signals and produce open_mine actions
 * for those that pass risk checks.
 */
export function evaluateSignals(
  signals: DetectedSignal[],
  profile: CapitalProfile,
  equity: number,
  allActiveMines: Mine[],
): MineAction[] {
  const actions: MineAction[] = [];
  // Track mines we're planning to open in this tick to avoid over-allocation
  let pendingCount = allActiveMines.length;

  for (const signal of signals) {
    // Re-check concurrent limit with pending opens
    if (pendingCount >= profile.maxConcurrentMines) break;

    const minesForAsset = allActiveMines.filter((m) => m.symbol === signal.symbol);
    const risk = checkRisk(signal, profile, equity, allActiveMines, minesForAsset);

    if (!risk.allowed) {
      actions.push({ type: 'no_action', reason: `${signal.symbol}: ${risk.reason}` });
      continue;
    }

    const now = Date.now();
    actions.push({
      type: 'open_mine',
      mine: {
        symbol: signal.symbol,
        status: 'pending',
        strategy: signal.suggestedStrategy,
        timeframe: signal.suggestedTimeframe,
        direction: signal.suggestedDirection,
        entrySignal: signal.signal,
        entryPrice: null,
        entryTime: null,
        entryOrderId: null,
        takeProfit: signal.suggestedTp,
        stopLoss: signal.suggestedSl,
        trailingStopPct: null,
        timeoutHours: profile.timeoutHours,
        profile: profile.name,
        allocatedCapital: risk.allocatedCapital,
        quantity: risk.quantity,
        unrealizedPnl: 0,
        maxUnrealizedPnl: 0,
        ticksMonitored: 0,
        lastCheck: now,
        exitPrice: null,
        exitTime: null,
        exitOrderId: null,
        outcome: null,
        realizedPnl: null,
        notes: [`signal: ${signal.signal.type} conf=${signal.signal.confidence.toFixed(2)}`],
      },
    });

    pendingCount++;
  }

  return actions;
}
