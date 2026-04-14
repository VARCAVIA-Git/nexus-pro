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
  AICSignal,
  AICConfluence,
  AICResearch,
  MarketRegime,
  SetupScorecard,
} from './types';
import type { LiveContext } from '@/lib/analytics/types';
import { isTpHit, isSlHit, isTimedOut, isLimitExpired, calcUnrealizedPnlPct } from './utils';
import { checkRisk } from './risk-manager';

// ─── Phase 4.5: AIC context for signal evaluation ────────────

export interface AICContext {
  regime?: MarketRegime;
  regimeConfidence?: number;
  confluence?: AICConfluence;
  research?: AICResearch;
  scorecards?: Map<string, SetupScorecard>;
}

// ─── Monitor existing mines ───────────────────────────────────

/**
 * Check all active mines against current prices and produce
 * close/adjust actions.
 */
// ─── Phase 6: Limit order expiry action ──────────────────────

export type MineActionP6 = MineAction
  | { type: 'expire_mine'; mineId: string };

export function monitorMines(
  mines: Mine[],
  liveContexts: Map<string, LiveContext>,
  profile: CapitalProfile,
): MineActionP6[] {
  const actions: MineActionP6[] = [];

  // Phase 6: check waiting mines for limit order expiry
  for (const mine of mines) {
    if (mine.status === 'waiting' && isLimitExpired(mine)) {
      actions.push({ type: 'expire_mine', mineId: mine.id });
    }
  }

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

// ─── Phase 4.5: AIC gates ─────────────────────────────────────

/**
 * Apply regime/confluence/research/scorecard gates to a signal's confidence.
 * Returns adjusted confidence and rejection reason (if any).
 */
export function applyAICGates(
  signal: DetectedSignal,
  aicCtx: AICContext,
): { confidence: number; rejected: boolean; reason?: string } {
  let confidence = signal.signal.confidence;
  const dir = signal.suggestedDirection;

  // 1. REGIME GATE
  if (aicCtx.regime) {
    const regime = aicCtx.regime;
    if (regime === 'CHOP') {
      confidence *= 0.7; // reduce 30% — choppy market
    } else if (regime === 'ACCUMULATION' && dir === 'short') {
      return { confidence: 0, rejected: true, reason: 'regime ACCUMULATION blocks SHORT' };
    } else if (regime === 'DISTRIBUTION' && dir === 'long') {
      return { confidence: 0, rejected: true, reason: 'regime DISTRIBUTION blocks LONG' };
    } else if (regime === 'BULL' && dir === 'long') {
      confidence = Math.min(1, confidence * 1.1);
    } else if (regime === 'BEAR' && dir === 'short') {
      confidence = Math.min(1, confidence * 1.1);
    }
  }

  // 2. CONFLUENCE GATE
  if (aicCtx.confluence) {
    if (aicCtx.confluence.score < 0.5) {
      confidence *= 0.8; // reduce 20%
    }
    // Bias contradicts signal → reject
    if (aicCtx.confluence.bias === 'BULLISH' && dir === 'short') {
      return { confidence: 0, rejected: true, reason: 'confluence BULLISH contradicts SHORT' };
    }
    if (aicCtx.confluence.bias === 'BEARISH' && dir === 'long') {
      return { confidence: 0, rejected: true, reason: 'confluence BEARISH contradicts LONG' };
    }
  }

  // 3. RESEARCH GATE
  if (aicCtx.research) {
    const r = aicCtx.research;
    if (r.funding_sentiment === 'LONG_CROWDED' && dir === 'long') {
      confidence *= 0.85; // reduce 15%
    }
    if (r.funding_sentiment === 'SHORT_CROWDED' && dir === 'short') {
      confidence *= 0.85;
    }
    if (r.fear_greed_index > 80 && dir === 'long') {
      confidence *= 0.9; // extreme greed, risky for longs
    }
    if (r.fear_greed_index < 20 && dir === 'short') {
      confidence *= 0.9; // extreme fear, risky for shorts
    }
  }

  // 4. SCORECARD GATE
  const setupName = (signal as any).aicSetupName as string | undefined;
  if (setupName && aicCtx.scorecards) {
    const sc = aicCtx.scorecards.get(setupName);
    if (sc && sc.total_executed >= 20) {
      // Hard reject losing setup
      if (sc.real_win_rate < 0.4) {
        return { confidence: 0, rejected: true, reason: `setup ${setupName} WR ${(sc.real_win_rate * 100).toFixed(0)}% < 40%` };
      }
      // Losing streak protection
      const last5 = (sc.last_10_outcomes ?? []).slice(-5);
      if (last5.length >= 5 && last5.every((o) => o === 'sl_hit' || o === 'timeout')) {
        return { confidence: 0, rejected: true, reason: `setup ${setupName} on 5-loss streak` };
      }
      // Recalibrate confidence if accuracy is low
      if (sc.confidence_accuracy < 0.5) {
        confidence = sc.real_win_rate; // trust real data over model
      }
    }
  }

  return { confidence: Math.max(0, Math.min(1, confidence)), rejected: false };
}

// ─── Evaluate new signals ─────────────────────────────────────

/**
 * Evaluate detected signals and produce open_mine actions
 * for those that pass risk checks.
 * @param aicCtx - Optional AIC context for Phase 4.5 gates
 */
export function evaluateSignals(
  signals: DetectedSignal[],
  profile: CapitalProfile,
  equity: number,
  allActiveMines: Mine[],
  aicCtx?: AICContext,
): MineAction[] {
  const actions: MineAction[] = [];
  // Track mines we're planning to open in this tick to avoid over-allocation
  let pendingCount = allActiveMines.length;

  for (const signal of signals) {
    // Re-check concurrent limit with pending opens
    if (pendingCount >= profile.maxConcurrentMines) break;

    // Phase 4.5: Apply AIC gates if context available
    let adjustedConfidence = signal.signal.confidence;
    if (aicCtx) {
      const gateResult = applyAICGates(signal, aicCtx);
      if (gateResult.rejected) {
        actions.push({ type: 'no_action', reason: `${signal.symbol}: ${gateResult.reason}` });
        continue;
      }
      adjustedConfidence = gateResult.confidence;
    }

    // Apply adjusted confidence to the signal for risk check
    const adjustedSignal = {
      ...signal,
      signal: { ...signal.signal, confidence: adjustedConfidence },
    };

    const minesForAsset = allActiveMines.filter((m) => m.symbol === signal.symbol);

    // Skip if we already have a mine in this direction for this asset
    const sameDirectionMine = minesForAsset.find(m => m.direction === signal.suggestedDirection && (m.status === 'open' || m.status === 'pending' || m.status === 'waiting'));
    if (sameDirectionMine) {
      actions.push({ type: 'no_action', reason: `${signal.symbol}: already have ${signal.suggestedDirection} mine` });
      continue;
    }

    const risk = checkRisk(adjustedSignal, profile, equity, allActiveMines, minesForAsset);

    if (!risk.allowed) {
      actions.push({ type: 'no_action', reason: `${signal.symbol}: ${risk.reason}` });
      continue;
    }

    pendingCount++;
    // Add to allActiveMines so subsequent signals see this pending mine
    allActiveMines.push({ symbol: signal.symbol, direction: signal.suggestedDirection, status: 'pending' } as any);

    const now = Date.now();
    // Phase 6: determine order type and initial status
    const orderType = signal.suggestedOrderType ?? 'market';
    const isLimit = orderType === 'limit' && signal.suggestedLimitPrice != null;
    const initialStatus = isLimit ? 'waiting' : 'pending';

    actions.push({
      type: 'open_mine',
      mine: {
        symbol: signal.symbol,
        status: initialStatus,
        strategy: signal.suggestedStrategy,
        timeframe: signal.suggestedTimeframe,
        direction: signal.suggestedDirection,
        entrySignal: { ...signal.signal, confidence: adjustedConfidence },
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
        notes: [`signal: ${signal.signal.type} conf=${adjustedConfidence.toFixed(2)}${aicCtx ? ' (AIC gated)' : ''} order=${orderType}`],
        // Phase 4.5 AIC fields
        aicSetupName: (signal as any).aicSetupName,
        aicConfidence: signal.signal.confidence,
        regimeAtEntry: aicCtx?.regime,
        confluenceAtEntry: aicCtx?.confluence?.score,
        // Phase 6 limit order fields
        entryOrderType: orderType,
        limitPrice: isLimit ? signal.suggestedLimitPrice : null,
        limitTimeoutMs: isLimit ? (signal.suggestedLimitTimeoutMs ?? 3600_000) : null,
        limitCreatedAt: isLimit ? now : null,
        evaluatorSource: signal.evaluatorSource,
      },
    });
  }

  return actions;
}
