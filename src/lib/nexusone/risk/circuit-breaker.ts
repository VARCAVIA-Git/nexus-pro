// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Circuit Breaker
//
// Three levels of throttle, all derived from equity peak and
// today's realized PnL. State lives in Redis so it survives
// restarts; counters reset at 00:00 UTC.
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet } from '@/lib/db/redis';

export const LIMITS = {
  DAILY_LOSS_WARNING: -0.02,      // sizing halved
  DAILY_LOSS_HALT: -0.03,         // trading paused for today
  MAX_DAILY_TRADES: 12,
  CONSEC_LOSS_LIMIT: 3,
  CONSEC_LOSS_COOLDOWN_MS: 2 * 60 * 60 * 1000, // 2h
  TOTAL_DRAWDOWN_KILL: -0.10,     // system OFF until manual reset
};

export interface CircuitState {
  date: string;                 // YYYY-MM-DD in UTC
  equity_peak: number;          // all-time peak
  equity_start_of_day: number;
  daily_realized_pnl: number;
  daily_trade_count: number;
  consecutive_losses_by_strategy: Record<string, number>;
  cooldown_until_by_strategy: Record<string, number>; // epoch ms
  system_killed: boolean;
  kill_reason: string | null;
  updated_at: number;
}

const KEY = 'nexusone:v2:circuit_breaker';
const TTL = 60 * 60 * 24 * 30; // 30 days

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getCircuitState(currentEquity: number): Promise<CircuitState> {
  const existing = await redisGet<CircuitState>(KEY);
  const today = todayUtc();

  if (!existing) {
    const fresh: CircuitState = {
      date: today,
      equity_peak: currentEquity,
      equity_start_of_day: currentEquity,
      daily_realized_pnl: 0,
      daily_trade_count: 0,
      consecutive_losses_by_strategy: {},
      cooldown_until_by_strategy: {},
      system_killed: false,
      kill_reason: null,
      updated_at: Date.now(),
    };
    await redisSet(KEY, fresh, TTL);
    return fresh;
  }

  // Daily rollover at 00:00 UTC
  if (existing.date !== today) {
    const rolled: CircuitState = {
      ...existing,
      date: today,
      equity_start_of_day: currentEquity,
      daily_realized_pnl: 0,
      daily_trade_count: 0,
      updated_at: Date.now(),
    };
    await redisSet(KEY, rolled, TTL);
    return rolled;
  }

  // Update equity peak
  if (currentEquity > existing.equity_peak) {
    existing.equity_peak = currentEquity;
    existing.updated_at = Date.now();
    await redisSet(KEY, existing, TTL);
  }

  return existing;
}

export interface CircuitDecision {
  allowed: boolean;
  reason: string;
  sizingMultiplier: number; // 0..1
}

export async function checkCircuit(
  strategyId: string,
  currentEquity: number,
): Promise<CircuitDecision> {
  const s = await getCircuitState(currentEquity);

  if (s.system_killed) {
    return { allowed: false, reason: `system_killed: ${s.kill_reason ?? 'unknown'}`, sizingMultiplier: 0 };
  }

  // Total drawdown kill (latched)
  const dd = (currentEquity - s.equity_peak) / s.equity_peak;
  if (dd <= LIMITS.TOTAL_DRAWDOWN_KILL) {
    s.system_killed = true;
    s.kill_reason = `total drawdown ${(dd * 100).toFixed(2)}%`;
    s.updated_at = Date.now();
    await redisSet(KEY, s, TTL);
    return { allowed: false, reason: s.kill_reason, sizingMultiplier: 0 };
  }

  const dailyReturn = s.equity_start_of_day > 0
    ? s.daily_realized_pnl / s.equity_start_of_day
    : 0;

  if (dailyReturn <= LIMITS.DAILY_LOSS_HALT) {
    return { allowed: false, reason: 'daily loss halt -3%', sizingMultiplier: 0 };
  }

  if (s.daily_trade_count >= LIMITS.MAX_DAILY_TRADES) {
    return { allowed: false, reason: 'max daily trades reached', sizingMultiplier: 0 };
  }

  const cooldownUntil = s.cooldown_until_by_strategy[strategyId] ?? 0;
  if (Date.now() < cooldownUntil) {
    return { allowed: false, reason: `strategy cooldown active until ${new Date(cooldownUntil).toISOString()}`, sizingMultiplier: 0 };
  }

  const sizingMultiplier = dailyReturn <= LIMITS.DAILY_LOSS_WARNING ? 0.5 : 1;
  return { allowed: true, reason: 'ok', sizingMultiplier };
}

export async function recordTradeOutcome(
  strategyId: string,
  netPnlUsd: number,
): Promise<void> {
  const s = await redisGet<CircuitState>(KEY);
  if (!s) return;

  s.daily_realized_pnl += netPnlUsd;
  s.daily_trade_count += 1;

  const consec = s.consecutive_losses_by_strategy[strategyId] ?? 0;
  if (netPnlUsd < 0) {
    const next = consec + 1;
    s.consecutive_losses_by_strategy[strategyId] = next;
    if (next >= LIMITS.CONSEC_LOSS_LIMIT) {
      s.cooldown_until_by_strategy[strategyId] = Date.now() + LIMITS.CONSEC_LOSS_COOLDOWN_MS;
      s.consecutive_losses_by_strategy[strategyId] = 0;
    }
  } else {
    s.consecutive_losses_by_strategy[strategyId] = 0;
  }

  s.updated_at = Date.now();
  await redisSet(KEY, s, TTL);
}
