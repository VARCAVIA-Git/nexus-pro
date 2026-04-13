// ═══════════════════════════════════════════════════════════════
// Phase 4 — Mine Tick (Orchestrator)
//
// Called every 60s by the cron worker. Full flow:
// 1. Check if engine is enabled
// 2. Fetch account + active mines + profile
// 3. Monitor existing mines (TP/SL/trailing/timeout)
// 4. Detect new signals for each supported asset
// 5. Evaluate signals through risk manager
// 6. Execute actions (open/close/adjust)
// 7. Update state in Redis
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
import type { AICContext } from './decision-engine';
import {
  placeMarketOrder,
  closePosition,
  getAccountInfo,
  getOrderStatus,
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

  // 4. Sync pending mines (check if entry orders filled)
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

  // 6. Detect signals — AIC-first with TS fallback
  let totalSignals = 0;
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
    if (!live) continue;

    const aicOnline = aicHealthMap.get(sym) ?? false;
    const aicCtx = aicContextMap.get(sym);

    let signals: DetectedSignal[] = [];

    if (aicOnline) {
      // Use AIC signals
      const aicSignal = await getLatestSignal(sym);
      if (aicSignal) {
        // Convert AIC signal to DetectedSignal format
        const direction: 'long' | 'short' = aicSignal.action === 'LONG' ? 'long' : 'short';
        const tp = Array.isArray(aicSignal.TP) && aicSignal.TP.length > 0 ? aicSignal.TP[0] : 0;
        const detected: DetectedSignal & { aicSetupName?: string } = {
          symbol: sym,
          signal: {
            type: 'pattern_match',
            confidence: aicSignal.confidence,
            sourcePattern: aicSignal.setup_name,
            macroClear: true, // AIC already factors this in
          },
          suggestedStrategy: 'trend',
          suggestedTimeframe: '4h',
          suggestedDirection: direction,
          suggestedTp: tp,
          suggestedSl: aicSignal.SL,
          aicSetupName: aicSignal.setup_name,
        };
        signals = [detected];
      }
    } else {
      // Fallback: use TypeScript signal detector
      const report = await loaders.loadReport(sym);
      if (!report) continue;
      const news = await loaders.loadNews(sym);
      const minesForAsset = allActiveMines.filter((m) => m.symbol === sym);

      const input: SignalDetectorInput = {
        symbol: sym,
        live,
        report,
        news,
        macroEvents,
        activeMineDirections: minesForAsset
          .filter((m) => m.status === 'open' || m.status === 'pending')
          .map((m) => m.direction),
      };
      signals = await detectSignals(input);
    }

    totalSignals += signals.length;
    const actions = evaluateSignals(signals, profile, equity, allActiveMines, aicCtx);
    allSignalActions.push(...actions);
  }

  // 7. Execute all actions
  const allActions = [...monitorActions, ...allSignalActions];
  let executed = 0;

  for (const action of allActions) {
    try {
      switch (action.type) {
        case 'open_mine': {
          const orderResult = await placeMarketOrder(
            action.mine.symbol,
            action.mine.direction,
            action.mine.quantity,
          );

          if (orderResult.success) {
            const mine = await createMine({
              ...action.mine,
              entryOrderId: orderResult.orderId,
              entryPrice: orderResult.filledPrice,
              entryTime: orderResult.filledPrice ? Date.now() : null,
              status: orderResult.filledPrice ? 'open' : 'pending',
            });
            mine; // created in Redis
            executed++;
          } else {
            errors.push(`open-mine ${action.mine.symbol}: ${orderResult.error}`);
          }
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

            // Save feedback for learning loop
            if (closed) {
              await saveFeedback(closed);
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
  };
}
