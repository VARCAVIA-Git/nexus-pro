// ═══════════════════════════════════════════════════════════════
// Phase 4 — Mine Engine Utilities
// ═══════════════════════════════════════════════════════════════

import { nanoid } from 'nanoid';
import type { Mine, MineStatus, AggressivenessProfile, CapitalProfile } from './types';
import { PROFILES, DEFAULT_PROFILE } from './constants';

/** Generate a unique mine ID (10 chars). */
export function generateMineId(): string {
  return nanoid(10);
}

/** Format PnL as signed string with 2 decimals. */
export function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${pnl.toFixed(2)}`;
}

/** Format PnL as percentage. */
export function formatPnlPct(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${pnl.toFixed(2)}%`;
}

/** Calculate unrealized PnL for a mine given current price. */
export function calcUnrealizedPnl(mine: Mine, currentPrice: number): number {
  if (mine.entryPrice == null || mine.quantity === 0) return 0;
  const delta = currentPrice - mine.entryPrice;
  const multiplier = mine.direction === 'long' ? 1 : -1;
  return delta * multiplier * mine.quantity;
}

/** Calculate unrealized PnL as percentage of entry. */
export function calcUnrealizedPnlPct(mine: Mine, currentPrice: number): number {
  if (mine.entryPrice == null || mine.entryPrice === 0) return 0;
  const delta = currentPrice - mine.entryPrice;
  const multiplier = mine.direction === 'long' ? 1 : -1;
  return (delta * multiplier / mine.entryPrice) * 100;
}

/** Check if a mine's take profit has been hit. */
export function isTpHit(mine: Mine, currentPrice: number): boolean {
  if (mine.entryPrice == null) return false;
  if (mine.direction === 'long') return currentPrice >= mine.takeProfit;
  return currentPrice <= mine.takeProfit;
}

/** Check if a mine's stop loss has been hit. */
export function isSlHit(mine: Mine, currentPrice: number): boolean {
  if (mine.entryPrice == null) return false;
  if (mine.direction === 'long') return currentPrice <= mine.stopLoss;
  return currentPrice >= mine.stopLoss;
}

/** Check if a mine has timed out. */
export function isTimedOut(mine: Mine, now: number = Date.now()): boolean {
  if (mine.entryTime == null) return false;
  const elapsed = now - mine.entryTime;
  return elapsed >= mine.timeoutHours * 3600 * 1000;
}

/** Get the capital profile by name. */
export function getProfile(name?: AggressivenessProfile | null): CapitalProfile {
  return PROFILES[name ?? DEFAULT_PROFILE] ?? PROFILES[DEFAULT_PROFILE];
}

/** Calculate position size given equity, risk %, and SL distance %. */
export function calcPositionSize(
  equity: number,
  riskPct: number,
  slDistancePct: number,
): number {
  if (slDistancePct <= 0 || equity <= 0) return 0;
  // Minimum SL distance: 1% to prevent astronomical position sizes
  const safeSLPct = Math.max(slDistancePct, 1.0);
  const riskAmount = equity * (riskPct / 100);
  const notional = riskAmount / (safeSLPct / 100);
  // Cap at 1% of equity per position (fits within available buying power)
  return Math.min(notional, equity * 0.01);
}

/** Check if a mine is in a terminal state. */
export function isTerminal(status: MineStatus): boolean {
  return status === 'closed' || status === 'cancelled';
}

/** Calculate TP/SL ratio. Returns 0 if SL distance is 0. */
export function calcRiskReward(entryPrice: number, tp: number, sl: number): number {
  const slDist = Math.abs(entryPrice - sl);
  if (slDist === 0) return 0;
  const tpDist = Math.abs(tp - entryPrice);
  return tpDist / slDist;
}
