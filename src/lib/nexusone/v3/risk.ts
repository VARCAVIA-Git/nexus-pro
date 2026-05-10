// NexusOne v3 — risk caps applied at runtime.
//
// Daily loss > 3% account → halt 24h.
// Weekly loss > 8% → halt 7d.
// 5 consecutive losses → halt 24h.

export interface RiskConfigV3 {
  initialEquity: number;
  maxConcurrent: number;
  dailyHaltPct: number;
  weeklyHaltPct: number;
  consecutiveLossesThreshold: number;
}

export const DEFAULT_RISK_V3: RiskConfigV3 = {
  initialEquity: 10000,
  maxConcurrent: 6,
  dailyHaltPct: 0.03,
  weeklyHaltPct: 0.08,
  consecutiveLossesThreshold: 5,
};

export interface RiskState {
  haltedUntilTs: number;
  consecutiveLosses: number;
  dailyPnL: Record<string, number>; // YYYY-MM-DD → dollars
  weeklyPnL: Record<string, number>;
}

export const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
export const weekKey = (ts: number) => {
  const d = new Date(ts);
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return start.toISOString().slice(0, 10);
};

export function isHalted(
  state: RiskState,
  ts: number,
  cfg: RiskConfigV3,
): { halted: boolean; reason?: string } {
  if (ts < state.haltedUntilTs) return { halted: true, reason: 'cooldown' };

  const dpnl = state.dailyPnL[dayKey(ts)] ?? 0;
  if (dpnl < -cfg.dailyHaltPct * cfg.initialEquity) {
    state.haltedUntilTs = ts + 24 * 3600 * 1000;
    return { halted: true, reason: 'daily_loss_cap' };
  }

  const wpnl = state.weeklyPnL[weekKey(ts)] ?? 0;
  if (wpnl < -cfg.weeklyHaltPct * cfg.initialEquity) {
    state.haltedUntilTs = ts + 7 * 24 * 3600 * 1000;
    return { halted: true, reason: 'weekly_loss_cap' };
  }
  return { halted: false };
}

export function recordPnL(state: RiskState, ts: number, netDollars: number, cfg: RiskConfigV3): void {
  const dk = dayKey(ts);
  const wk = weekKey(ts);
  state.dailyPnL[dk] = (state.dailyPnL[dk] ?? 0) + netDollars;
  state.weeklyPnL[wk] = (state.weeklyPnL[wk] ?? 0) + netDollars;
  if (netDollars < 0) state.consecutiveLosses++;
  else state.consecutiveLosses = 0;
  if (state.consecutiveLosses >= cfg.consecutiveLossesThreshold) {
    state.haltedUntilTs = Math.max(state.haltedUntilTs, ts + 24 * 3600 * 1000);
    state.consecutiveLosses = 0;
  }
}

export function makeRiskState(): RiskState {
  return { haltedUntilTs: 0, consecutiveLosses: 0, dailyPnL: {}, weeklyPnL: {} };
}
