// ═══════════════════════════════════════════════════════════════
// NexusOne — Risk Engine
//
// Hard rules. No dynamic Kelly. No complexity.
// Rules from the manual:
//   - one position per asset
//   - fixed low risk
//   - daily loss limit
//   - consecutive losses kill-switch
//   - rolling negative edge → stop
//   - fill rate too low → stop
//   - slippage too high → stop
// ═══════════════════════════════════════════════════════════════

import type { KillSwitchState, TradeResult, OrderAttempt } from './types';
import { redisGet, redisSet } from '@/lib/db/redis';

const KEY_KILL = 'nexusone:risk:kill_switch';
const KEY_TRADES = 'nexusone:risk:recent_trades';
const KEY_ORDERS = 'nexusone:risk:recent_orders';
const KEY_DAILY_LOSS = 'nexusone:risk:daily_loss';

// ─── Default thresholds ──────────────────────────────────────

const DEFAULT_KILL_STATE: KillSwitchState = {
  triggered: false,
  reason: null,
  triggered_at: null,
  max_daily_loss_r: 1.5,        // max 1.5R daily loss
  max_weekly_loss_r: 3.0,        // max 3R weekly loss
  max_consecutive_losses: 5,
  min_fill_rate: 0.5,            // at least 50% of orders must fill
  max_slippage_bps: 15,          // max 15bps average slippage
  rolling_window_trades: 20,     // check last 20 trades
};

// ─── Kill Switch State ───────────────────────────────────────

export async function getKillSwitch(): Promise<KillSwitchState> {
  const saved = await redisGet<KillSwitchState>(KEY_KILL);
  return saved ?? { ...DEFAULT_KILL_STATE };
}

export async function triggerKillSwitch(reason: string): Promise<void> {
  const state = await getKillSwitch();
  state.triggered = true;
  state.reason = reason;
  state.triggered_at = Date.now();
  await redisSet(KEY_KILL, state);
  console.error(`[nexusone-risk] KILL SWITCH TRIGGERED: ${reason}`);
}

export async function resetKillSwitch(): Promise<void> {
  await redisSet(KEY_KILL, { ...DEFAULT_KILL_STATE });
  console.log('[nexusone-risk] Kill switch reset');
}

// ─── Position Sizing ─────────────────────────────────────────

/**
 * Calculate position size. Simple fixed risk for now.
 * Manual says: 0.25%-0.50% of capital per trade as risk.
 */
export function calculatePositionSize(
  equity: number,
  riskPct: number = 0.5,  // 0.5% of equity at risk
  slDistancePct: number = 1.0,
): { notional: number; quantity: number; riskAmount: number } {
  const riskAmount = equity * (riskPct / 100);
  const notional = slDistancePct > 0 ? riskAmount / (slDistancePct / 100) : 0;

  return {
    notional: Math.round(notional * 100) / 100,
    quantity: 0, // calculated by caller based on price
    riskAmount: Math.round(riskAmount * 100) / 100,
  };
}

// ─── Pre-Trade Risk Check ────────────────────────────────────

export interface RiskCheck {
  allowed: boolean;
  reason: string | null;
}

/**
 * Check if a new trade is allowed given current risk state.
 */
export async function checkPreTrade(
  openPositions: number,
  maxPositions: number = 1,
): Promise<RiskCheck> {
  // 1. Kill switch
  const ks = await getKillSwitch();
  if (ks.triggered) {
    return { allowed: false, reason: `kill switch: ${ks.reason}` };
  }

  // 2. Max positions
  if (openPositions >= maxPositions) {
    return { allowed: false, reason: `max positions reached (${openPositions}/${maxPositions})` };
  }

  return { allowed: true, reason: null };
}

// ─── Post-Trade Risk Evaluation ──────────────────────────────

/**
 * Evaluate risk metrics after a trade closes.
 * May trigger kill switch if thresholds breached.
 */
export async function evaluatePostTrade(
  recentTrades: TradeResult[],
  recentOrders: OrderAttempt[],
): Promise<string[]> {
  const alerts: string[] = [];
  const ks = await getKillSwitch();

  // Rolling window
  const window = recentTrades.slice(-ks.rolling_window_trades);
  if (window.length < 3) return alerts; // not enough data

  // 1. Consecutive losses
  let consecutiveLosses = 0;
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i].net_bps < 0) consecutiveLosses++;
    else break;
  }
  if (consecutiveLosses >= ks.max_consecutive_losses) {
    await triggerKillSwitch(`${consecutiveLosses} consecutive losses`);
    alerts.push(`KILL: ${consecutiveLosses} consecutive losses`);
    return alerts;
  }

  // 2. Rolling edge negative
  if (window.length >= ks.rolling_window_trades) {
    const avgNetBps = window.reduce((s, t) => s + t.net_bps, 0) / window.length;
    if (avgNetBps < 0) {
      await triggerKillSwitch(`rolling ${window.length} trades net negative (${avgNetBps.toFixed(1)} bps)`);
      alerts.push(`KILL: rolling edge negative`);
      return alerts;
    }
  }

  // 3. Fill rate check
  if (recentOrders.length >= 10) {
    const filled = recentOrders.filter(o => o.fill_status === 'filled').length;
    const fillRate = filled / recentOrders.length;
    if (fillRate < ks.min_fill_rate) {
      await triggerKillSwitch(`fill rate ${(fillRate * 100).toFixed(0)}% < ${(ks.min_fill_rate * 100).toFixed(0)}%`);
      alerts.push(`KILL: fill rate too low`);
      return alerts;
    }
  }

  // 4. Slippage check
  const filledOrders = recentOrders.filter(o => o.fill_status === 'filled' && o.slippage_bps > 0);
  if (filledOrders.length >= 5) {
    const avgSlippage = filledOrders.reduce((s, o) => s + o.slippage_bps, 0) / filledOrders.length;
    if (avgSlippage > ks.max_slippage_bps) {
      await triggerKillSwitch(`avg slippage ${avgSlippage.toFixed(1)} bps > ${ks.max_slippage_bps} bps`);
      alerts.push(`KILL: slippage too high`);
      return alerts;
    }
  }

  return alerts;
}
