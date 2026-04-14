// ═══════════════════════════════════════════════════════════════
// Phase 4 + 6 — Mine Tick (Orchestrator)
//
// Called every 30s by the cron worker. Full flow:
// 1. Check if engine is enabled
// 2. Fetch account + active mines + profile
// 3. Sync waiting mines (limit order fill/expiry check)
// 4. Sync pending mines (market order fill check)
// 5. Monitor open mines (TP/SL/trailing/timeout)
// 6. Run continuous evaluator for each asset
// 7. Detect new signals (evaluator + AIC + TS)
// 8. Evaluate signals through risk manager
// 9. Execute actions (open/close/adjust/expire)
// 10. Update asset memory + portfolio snapshot
// ═══════════════════════════════════════════════════════════════

import type { Mine, MineAction, CapitalProfile, AICSignal, DetectedSignal, MarketRegime } from './types';
import type { LiveContext, AnalyticReport, NewsDigest, MacroEvent } from '@/lib/analytics/types';
import {
  isEngineEnabled,
  getActiveMines,
  getActiveProfile,
  createMine,
  updateMine,
  closeMine as storeCloseMine,
  savePortfolioSnapshot,
  updateEngineTick,
} from './mine-store';
import { getProfile, calcUnrealizedPnl } from './utils';
import { detectSignals } from './signal-detector';
import type { SignalDetectorInput } from './signal-detector';
import { monitorMines, evaluateSignals } from './decision-engine';
import type { AICContext, MineActionP6 } from './decision-engine';
import {
  placeMarketOrder,
  placeLimitOrder,
  closePosition,
  cancelOrder,
  getAccountInfo,
  getOrderStatus,
  checkPendingLimitOrder,
} from './execution';
import { saveFeedback } from './feedback';
import { SUPPORTED_SYMBOLS } from './constants';
import {
  isAICHealthy,
  getLatestSignal,
  getConfluence,
  getRegime,
  getResearch,
  sendFeedback as sendAICFeedback,
} from './aic-client';
import { evaluateAndSave as evaluateContinuous } from '@/lib/analytics/continuous-evaluator';
import type { EvaluatorInput } from '@/lib/analytics/continuous-evaluator';
import { tickUpdate as memoryTickUpdate, onMineClose as memoryOnMineClose } from '@/lib/analytics/asset-memory';

// ─── Data Loaders (injected for testability) ──────────────────

export interface DataLoaders {
  loadLiveContext(symbol: string): Promise<LiveContext | null>;
  loadReport(symbol: string): Promise<AnalyticReport | null>;
  loadNews(symbol: string): Promise<NewsDigest | null>;
  loadMacroEvents(): Promise<MacroEvent[]>;
}

// ─── Tick Result ──────────────────────────────────────────────

export interface MineTickResult {
  enabled: boolean;
  skipped?: string;
  monitored: number;
  signalsDetected: number;
  actionsExecuted: number;
  errors: string[];
  elapsedMs: number;
  aicOnline?: boolean;
  regime?: string;
  // Phase 6
  waitingMines?: number;
  limitOrdersFilled?: number;
  limitOrdersExpired?: number;
  evaluations?: number;
}

// ─── Main ─────────────────────────────────────────────────────

export async function executeMineeTick(
  loaders: DataLoaders,
): Promise<MineTickResult> {
  const start = Date.now();
  const errors: string[] = [];

  // 1. Engine enabled?
  const enabled = await isEngineEnabled();
  if (!enabled) {
    return { enabled: false, skipped: 'engine-disabled', monitored: 0, signalsDetected: 0, actionsExecuted: 0, errors: [], elapsedMs: Date.now() - start };
  }

  // 2. Fetch state
  const [account, allActiveMines, profileName] = await Promise.all([
    getAccountInfo(),
    getActiveMines(),
    getActiveProfile(),
  ]);

  if (!account) {
    await updateEngineTick('broker-unreachable');
    return { enabled: true, skipped: 'broker-unreachable', monitored: 0, signalsDetected: 0, actionsExecuted: 0, errors: ['Could not reach broker'], elapsedMs: Date.now() - start };
  }

  const profile: CapitalProfile = getProfile(profileName);
  const equity = account.equity;

  // 3. Load live contexts for all supported symbols
  const liveContexts = new Map<string, LiveContext>();
  for (const sym of SUPPORTED_SYMBOLS) {
    const live = await loaders.loadLiveContext(sym);
    if (live) liveContexts.set(sym, live);
  }

  // 4a. Phase 6: Sync WAITING mines (limit orders — check fill/expiry)
  let limitFilled = 0;
  let limitExpired = 0;
  const waitingMines = allActiveMines.filter((m) => m.status === 'waiting');
  for (const mine of waitingMines) {
    if (!mine.entryOrderId) continue;
    try {
      const check = await checkPendingLimitOrder(
        mine.entryOrderId,
        mine.id,
        mine.limitCreatedAt ?? mine.createdAt,
        mine.limitTimeoutMs ?? 3600_000,
      );
      if (check.status === 'filled') {
        await updateMine(mine.id, {
          status: 'open',
          entryPrice: check.filledPrice ?? mine.limitPrice ?? mine.entryPrice,
          entryTime: Date.now(),
        });
        mine.status = 'open';
        mine.entryPrice = check.filledPrice ?? mine.limitPrice ?? mine.entryPrice;
        mine.entryTime = Date.now();
        limitFilled++;
        console.log(`[mine-tick] ${mine.symbol}: limit order FILLED @ ${mine.entryPrice}`);
      } else if (check.status === 'expired') {
        await updateMine(mine.id, { status: 'expired', outcome: 'limit_expired' });
        mine.status = 'expired';
        limitExpired++;
        console.log(`[mine-tick] ${mine.symbol}: limit order EXPIRED (mine ${mine.id})`);
      } else if (check.status === 'cancelled') {
        await updateMine(mine.id, { status: 'cancelled' });
        mine.status = 'cancelled';
      }
    } catch (e: any) {
      errors.push(`sync-waiting ${mine.id}: ${e?.message}`);
    }
  }

  // 4b. Sync PENDING mines (market orders — check if filled)
  const pendingMines = allActiveMines.filter((m) => m.status === 'pending');
  for (const mine of pendingMines) {
    if (!mine.entryOrderId) continue;
    try {
      const order = await getOrderStatus(mine.entryOrderId);
      if (order?.status === 'filled') {
        await updateMine(mine.id, {
          status: 'open',
          entryPrice: order.filledPrice || mine.entryPrice,
          entryTime: Date.now(),
        });
        mine.status = 'open';
        mine.entryPrice = order.filledPrice || mine.entryPrice;
        mine.entryTime = Date.now();
      } else if (order?.status === 'cancelled' || order?.status === 'rejected') {
        await updateMine(mine.id, { status: 'cancelled' });
        mine.status = 'cancelled';
      }
    } catch (e: any) {
      errors.push(`sync-pending ${mine.id}: ${e?.message}`);
    }
  }

  // 5. Monitor open mines
  const openMines = allActiveMines.filter((m) => m.status === 'open');
  const monitorActions = monitorMines(openMines, liveContexts, profile);

  // 6. Phase 6: Run continuous evaluator + detect signals
  let totalSignals = 0;
  let evaluationCount = 0;
  const allSignalActions: MineAction[] = [];
  const macroEvents = await loaders.loadMacroEvents();

  // Phase 4.5: check AIC health for each symbol and build AIC context
  const aicHealthMap = new Map<string, boolean>();
  const aicContextMap = new Map<string, AICContext>();
  let anyAicOnline = false;
  let tickRegime: string | undefined;

  for (const sym of SUPPORTED_SYMBOLS) {
    const healthy = await isAICHealthy(sym);
    aicHealthMap.set(sym, healthy);

    if (healthy) {
      anyAicOnline = true;
      const [regimeData, confluence, research] = await Promise.all([
        getRegime(sym),
        getConfluence(sym),
        getResearch(sym),
      ]);
      const ctx: AICContext = {
        regime: regimeData?.regime as MarketRegime | undefined,
        regimeConfidence: regimeData?.confidence,
        confluence: confluence ?? undefined,
        research: research ?? undefined,
      };
      aicContextMap.set(sym, ctx);
      if (!tickRegime && ctx.regime) tickRegime = ctx.regime;
    }
  }

  for (const sym of SUPPORTED_SYMBOLS) {
    const live = liveContexts.get(sym);
    if (!live) {
      console.log(`[mine-tick] ${sym}: no live context, skipping`);
      continue;
    }

    const aicOnline = aicHealthMap.get(sym) ?? false;
    const aicCtx = aicContextMap.get(sym);

    let signals: DetectedSignal[] = [];

    const report = await loaders.loadReport(sym);
    if (!report) {
      console.log(`[mine-tick] ${sym}: no report, skipping signal detection`);
    }
    const news = await loaders.loadNews(sym);
    const minesForAsset = allActiveMines.filter((m) => m.symbol === sym);

    // Phase 6: Run continuous evaluator
    if (report && live) {
      try {
        const memory = await memoryTickUpdate(sym, live);
        const evalInput: EvaluatorInput = { symbol: sym, live, report, memory, riskProfile: profileName };
        const evaluation = await evaluateContinuous(evalInput);
        evaluationCount++;

        // If evaluator recommends a trade, inject as a DetectedSignal
        if (evaluation.shouldTrade && evaluation.direction && evaluation.confidence > 0) {
          const evalSignal: DetectedSignal = {
            symbol: sym,
            signal: {
              type: 'pattern_match',
              confidence: evaluation.confidence,
              sourcePattern: `evaluator:${evaluation.strategy}`,
              macroClear: true,
            },
            suggestedStrategy: evaluation.strategy,
            suggestedTimeframe: evaluation.timeframe,
            suggestedDirection: evaluation.direction,
            suggestedTp: evaluation.tp ?? live.price * (evaluation.direction === 'long' ? 1.025 : 0.975),
            suggestedSl: evaluation.sl ?? live.price * (evaluation.direction === 'long' ? 0.985 : 1.015),
            // Phase 6 limit order hints
            suggestedOrderType: evaluation.orderType,
            suggestedLimitPrice: evaluation.orderType === 'limit' ? (evaluation.suggestedEntry ?? undefined) : undefined,
            suggestedLimitTimeoutMs: evaluation.timeoutMs ?? undefined,
            evaluatorSource: evaluation.strategy,
          };
          signals.push(evalSignal);
          console.log(`[mine-tick] ${sym}: evaluator signal — ${evaluation.direction} conf=${evaluation.confidence.toFixed(2)} order=${evaluation.orderType}${evaluation.orderType === 'limit' ? ' @' + evaluation.suggestedEntry?.toFixed(2) : ''}`);
        }
      } catch (e: any) {
        errors.push(`evaluator ${sym}: ${e?.message}`);
      }
    }

    // Detect signals from other sources (AIC + rules + trend + zones)
    if (report) {
      const input: SignalDetectorInput = {
        symbol: sym,
        live,
        report,
        news,
        macroEvents,
        activeMineDirections: minesForAsset
          .filter((m) => m.status === 'open' || m.status === 'pending' || m.status === 'waiting')
          .map((m) => m.direction),
      };
      const otherSignals = await detectSignals(input);
      signals.push(...otherSignals);

      if (signals.length > 0) {
        // Sort all signals by confidence
        signals.sort((a, b) => b.signal.confidence - a.signal.confidence);
        console.log(`[mine-tick] ${sym}: ${signals.length} total signals — best: ${signals[0].signal.type} conf=${signals[0].signal.confidence.toFixed(2)} dir=${signals[0].suggestedDirection}`);
      }
    }

    totalSignals += signals.length;
    const actions = evaluateSignals(signals, profile, equity, allActiveMines, aicCtx);
    allSignalActions.push(...actions);
  }

  // 7. Execute all actions
  const allActions: MineActionP6[] = [...monitorActions, ...allSignalActions];
  let executed = 0;

  for (const action of allActions) {
    try {
      switch (action.type) {
        case 'open_mine': {
          // Cap order to a safe size: max $500 notional per trade
          const MAX_NOTIONAL = 500;
          let qty = action.mine.quantity;
          const price = liveContexts.get(action.mine.symbol)?.price ?? 0;
          if (price > 0) {
            const maxQty = MAX_NOTIONAL / price;
            if (qty > maxQty) qty = maxQty;
          }
          // Round quantity appropriately
          qty = action.mine.symbol.includes('/')
            ? parseFloat(qty.toFixed(6))  // crypto: 6 decimals
            : parseFloat(qty.toFixed(2)); // stock: 2 decimals
          if (qty <= 0) { errors.push(`open-mine ${action.mine.symbol}: zero quantity`); break; }

          // Phase 6: Choose between market and limit order
          const useLimit = action.mine.entryOrderType === 'limit' && action.mine.limitPrice != null;

          const orderResult = useLimit
            ? await placeLimitOrder(action.mine.symbol, action.mine.direction, qty, action.mine.limitPrice!)
            : await placeMarketOrder(action.mine.symbol, action.mine.direction, qty);

          if (orderResult.success) {
            const isLimitOrder = useLimit && !orderResult.filledPrice;
            const mine = await createMine({
              ...action.mine,
              entryOrderId: orderResult.orderId,
              entryPrice: orderResult.filledPrice,
              entryTime: orderResult.filledPrice ? Date.now() : null,
              status: isLimitOrder ? 'waiting' : (orderResult.filledPrice ? 'open' : 'pending'),
              limitCreatedAt: isLimitOrder ? Date.now() : action.mine.limitCreatedAt,
            });
            if (isLimitOrder) {
              console.log(`[mine-tick] ${action.mine.symbol}: LIMIT order placed @ ${action.mine.limitPrice} (mine ${mine.id})`);
            }
            executed++;
          } else {
            errors.push(`open-mine ${action.mine.symbol}: ${orderResult.error}`);
          }
          break;
        }

        case 'expire_mine': {
          // Phase 6: Cancel limit order and expire the mine
          const mine = allActiveMines.find((m) => m.id === action.mineId);
          if (!mine) break;
          if (mine.entryOrderId) {
            await cancelOrder(mine.entryOrderId);
          }
          await updateMine(mine.id, { status: 'expired', outcome: 'limit_expired' });
          console.log(`[mine-tick] ${mine.symbol}: mine ${mine.id} EXPIRED (limit not filled)`);
          executed++;
          break;
        }

        case 'close_mine': {
          const mine = allActiveMines.find((m) => m.id === action.mineId);
          if (!mine) break;

          const live = liveContexts.get(mine.symbol);
          const currentPrice = live?.price ?? mine.entryPrice ?? 0;

          const orderResult = await closePosition(mine.symbol, mine.direction, mine.quantity);

          if (orderResult.success) {
            const exitPrice = orderResult.filledPrice ?? currentPrice;
            const closed = await storeCloseMine(mine.id, action.reason, exitPrice);

            // Save feedback for learning loop + asset memory
            if (closed) {
              await saveFeedback(closed);
              // Phase 6: update asset memory
              memoryOnMineClose(closed).catch(() => {});
              // Phase 4.5: send feedback to AIC
              if (closed.aicSetupName) {
                sendAICFeedback(closed.symbol, {
                  ...({} as any), // spread TradeOutcome fields
                  mineId: closed.id,
                  symbol: closed.symbol,
                  strategy: closed.strategy,
                  timeframe: closed.timeframe,
                  direction: closed.direction,
                  entryPrice: closed.entryPrice ?? 0,
                  exitPrice: closed.exitPrice ?? 0,
                  pnlPct: closed.realizedPnl
                    ? ((closed.exitPrice! - closed.entryPrice!) * (closed.direction === 'long' ? 1 : -1) / closed.entryPrice!) * 100
                    : 0,
                  outcome: closed.outcome!,
                  durationHours: closed.entryTime && closed.exitTime
                    ? (closed.exitTime - closed.entryTime) / 3600_000
                    : 0,
                  entrySignal: closed.entrySignal,
                  closedAt: closed.exitTime ?? Date.now(),
                  setup_name: closed.aicSetupName,
                  original_confidence: closed.aicConfidence ?? closed.entrySignal.confidence,
                  regime_at_entry: closed.regimeAtEntry,
                  confluence_at_entry: closed.confluenceAtEntry,
                }).catch(() => {}); // fire-and-forget
              }
            }
            executed++;
          } else {
            errors.push(`close-mine ${mine.id}: ${orderResult.error}`);
          }
          break;
        }

        case 'adjust_sl': {
          await updateMine(action.mineId, {
            stopLoss: action.newSl,
            trailingStopPct: profile.trailingStopDistancePct,
            notes: [`trailing SL adjusted to ${action.newSl.toFixed(2)}`] as any,
          });
          executed++;
          break;
        }

        case 'no_action':
          // Logged but no execution needed
          break;
      }
    } catch (e: any) {
      errors.push(`action ${action.type}: ${e?.message}`);
    }
  }

  // 8. Update portfolio snapshot + tick timestamp
  const updatedMines = await getActiveMines();
  let totalUnrealized = 0;
  let totalAllocated = 0;
  for (const mine of updatedMines) {
    const live = liveContexts.get(mine.symbol);
    if (live?.price && mine.entryPrice) {
      const pnl = calcUnrealizedPnl(mine, live.price);
      totalUnrealized += pnl;

      // Update mine's unrealized PnL
      await updateMine(mine.id, {
        unrealizedPnl: pnl,
        maxUnrealizedPnl: Math.max(mine.maxUnrealizedPnl, pnl),
        ticksMonitored: mine.ticksMonitored + 1,
        lastCheck: Date.now(),
      });
    }
    totalAllocated += mine.allocatedCapital;
  }

  await savePortfolioSnapshot({
    equity,
    buyingPower: account.buyingPower,
    totalAllocated,
    totalUnrealizedPnl: totalUnrealized,
    minesCount: updatedMines.length,
    updatedAt: Date.now(),
  });

  await updateEngineTick(errors.length > 0 ? errors.join('; ') : undefined);

  return {
    enabled: true,
    monitored: openMines.length,
    signalsDetected: totalSignals,
    actionsExecuted: executed,
    errors,
    elapsedMs: Date.now() - start,
    aicOnline: anyAicOnline,
    regime: tickRegime,
    // Phase 6
    waitingMines: waitingMines.length,
    limitOrdersFilled: limitFilled,
    limitOrdersExpired: limitExpired,
    evaluations: evaluationCount,
  };
}
