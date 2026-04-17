// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Position Manager
//
// Tracks open v2 positions in Redis and decides when to flatten.
// Exits on TP, SL, time-stop, or trailing-stop.
//
// A "position" here is the NexusOne-internal lifecycle of a trade,
// not a broker position: it aggregates entry order, open params,
// features snapshot and trailing state. On exit we write a full
// TradeRecord via the dual-writer.
// ═══════════════════════════════════════════════════════════════

import { nanoid } from 'nanoid';
import { redisGet, redisSet, redisDel, redisLpush, redisLrange } from '@/lib/db/redis';
import type { StrategySignal } from '../strategies-v2/strategy.interface';
import type { Regime } from './regime-detector';
import { dualWriter, type TradeRecord } from '../persistence/dual-writer';
import { recordTradeOutcome } from '../risk/circuit-breaker';

export const POSITION_KEY_PREFIX = 'nexusone:v2:position';
export const POSITIONS_INDEX = 'nexusone:v2:positions:open';

export const CRYPTO_FEE_PCT = 0.0025; // Alpaca paper fee per leg

export interface Position {
  position_id: string;
  strategy_id: string;
  asset: string;
  direction: 'long' | 'short';
  entry_order_id: string;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  take_profit: number;
  time_stop_min: number;
  regime_at_entry: Regime;
  is_simulated: boolean;
  opened_at: string;
  trailing_active: boolean;
  trailing_stop: number | null;
  trailing_atr: number; // ATR captured at entry
}

export async function openPosition(params: {
  signal: StrategySignal;
  entryOrderId: string;
  quantity: number;
  actualEntryPrice: number;
  regime: Regime;
  isSimulated: boolean;
  atrAtEntry: number;
}): Promise<Position> {
  const pos: Position = {
    position_id: `pos_${nanoid(12)}`,
    strategy_id: params.signal.strategyId,
    asset: params.signal.asset,
    direction: params.signal.direction,
    entry_order_id: params.entryOrderId,
    entry_price: params.actualEntryPrice,
    quantity: params.quantity,
    stop_loss: params.signal.stopLoss,
    take_profit: params.signal.takeProfit,
    time_stop_min: params.signal.timeStopMin,
    regime_at_entry: params.regime,
    is_simulated: params.isSimulated,
    opened_at: new Date().toISOString(),
    trailing_active: false,
    trailing_stop: null,
    trailing_atr: params.atrAtEntry,
  };
  await redisSet(`${POSITION_KEY_PREFIX}:${params.signal.asset}`, pos, 60 * 60 * 72);
  await redisLpush(POSITIONS_INDEX, pos.position_id, 100);
  return pos;
}

export async function getOpenPosition(asset: string): Promise<Position | null> {
  return redisGet<Position>(`${POSITION_KEY_PREFIX}:${asset}`);
}

export async function listOpenPositions(assets: string[]): Promise<Position[]> {
  const results = await Promise.all(assets.map(a => getOpenPosition(a)));
  return results.filter((p): p is Position => p !== null);
}

export type ExitReason = 'take_profit' | 'stop_loss' | 'time_stop' | 'trailing_stop' | 'circuit_breaker' | 'manual';

export interface ExitDecision {
  shouldExit: boolean;
  reason: ExitReason | null;
  updatedTrailing?: { active: boolean; level: number | null };
}

/**
 * Pure decision function — does not mutate state. Caller can apply
 * the returned `updatedTrailing` via `updatePosition()` if desired.
 */
export function decideExit(pos: Position, currentPrice: number, nowMs: number): ExitDecision {
  const minElapsed = (nowMs - new Date(pos.opened_at).getTime()) / 60_000;

  if (pos.direction === 'long') {
    if (currentPrice <= pos.stop_loss) return { shouldExit: true, reason: 'stop_loss' };
    if (currentPrice >= pos.take_profit) return { shouldExit: true, reason: 'take_profit' };
    if (minElapsed >= pos.time_stop_min) return { shouldExit: true, reason: 'time_stop' };

    // Trailing stop: activate after +0.5%, trail at 0.8 × ATR
    const gainPct = (currentPrice - pos.entry_price) / pos.entry_price;
    if (!pos.trailing_active && gainPct >= 0.005) {
      const level = currentPrice - 0.8 * pos.trailing_atr;
      return { shouldExit: false, reason: null, updatedTrailing: { active: true, level } };
    }
    if (pos.trailing_active && pos.trailing_stop !== null) {
      const newLevel = Math.max(pos.trailing_stop, currentPrice - 0.8 * pos.trailing_atr);
      if (currentPrice <= newLevel) return { shouldExit: true, reason: 'trailing_stop' };
      if (newLevel !== pos.trailing_stop) return { shouldExit: false, reason: null, updatedTrailing: { active: true, level: newLevel } };
    }
    return { shouldExit: false, reason: null };
  }

  // short
  if (currentPrice >= pos.stop_loss) return { shouldExit: true, reason: 'stop_loss' };
  if (currentPrice <= pos.take_profit) return { shouldExit: true, reason: 'take_profit' };
  if (minElapsed >= pos.time_stop_min) return { shouldExit: true, reason: 'time_stop' };

  const gainPct = (pos.entry_price - currentPrice) / pos.entry_price;
  if (!pos.trailing_active && gainPct >= 0.005) {
    const level = currentPrice + 0.8 * pos.trailing_atr;
    return { shouldExit: false, reason: null, updatedTrailing: { active: true, level } };
  }
  if (pos.trailing_active && pos.trailing_stop !== null) {
    const newLevel = Math.min(pos.trailing_stop, currentPrice + 0.8 * pos.trailing_atr);
    if (currentPrice >= newLevel) return { shouldExit: true, reason: 'trailing_stop' };
    if (newLevel !== pos.trailing_stop) return { shouldExit: false, reason: null, updatedTrailing: { active: true, level: newLevel } };
  }
  return { shouldExit: false, reason: null };
}

export async function updateTrailing(pos: Position, active: boolean, level: number | null): Promise<void> {
  pos.trailing_active = active;
  pos.trailing_stop = level;
  await redisSet(`${POSITION_KEY_PREFIX}:${pos.asset}`, pos, 60 * 60 * 72);
}

/**
 * Finalize a closed position and emit a TradeRecord via the dual-writer.
 */
export async function closePosition(
  pos: Position,
  exitOrderId: string,
  exitPrice: number,
  reason: ExitReason,
  regimeAtExit: Regime,
): Promise<TradeRecord> {
  const directionSign = pos.direction === 'long' ? 1 : -1;
  const gross = (exitPrice - pos.entry_price) * directionSign * pos.quantity;
  const fees = (pos.entry_price + exitPrice) * pos.quantity * CRYPTO_FEE_PCT;
  const netPnl = gross - fees;
  const pnlPercent = pos.entry_price > 0 ? (gross / (pos.entry_price * pos.quantity)) * 100 : 0;
  const closedAt = new Date().toISOString();
  const holdMin = Math.round((Date.parse(closedAt) - Date.parse(pos.opened_at)) / 60_000);

  const trade: TradeRecord = {
    trade_id: `trd_${nanoid(12)}`,
    strategy_id: pos.strategy_id,
    asset: pos.asset,
    direction: pos.direction,
    entry_order_id: pos.entry_order_id,
    exit_order_id: exitOrderId,
    entry_price: pos.entry_price,
    exit_price: exitPrice,
    quantity: pos.quantity,
    pnl: gross,
    pnl_percent: pnlPercent,
    fees,
    net_pnl: netPnl,
    hold_duration_min: holdMin,
    exit_reason: reason,
    regime_at_entry: pos.regime_at_entry,
    regime_at_exit: regimeAtExit,
    is_simulated: pos.is_simulated,
    opened_at: pos.opened_at,
    closed_at: closedAt,
  };

  await redisDel(`${POSITION_KEY_PREFIX}:${pos.asset}`);
  await dualWriter.writeTrade(trade);
  await recordTradeOutcome(pos.strategy_id, netPnl);
  return trade;
}

export async function listRecentTrades(limit: number = 50): Promise<TradeRecord[]> {
  return redisLrange<TradeRecord>('nexusone:v2:trades:history', 0, limit - 1);
}
