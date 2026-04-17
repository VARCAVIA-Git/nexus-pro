// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Position Sizer
//
// Modified Half-Kelly with risk-based floor and hard caps.
// Returns the USD notional to allocate (0 when no trade allowed).
// ═══════════════════════════════════════════════════════════════

export interface SizingInput {
  equity: number;           // current portfolio equity (USD)
  currentExposure: number;  // sum of open notional (USD)
  entryPrice: number;
  stopLoss: number;
  historicalWinRate: number;   // 0..1
  avgWinLossRatio: number;     // avgWin / |avgLoss|
  sizingMultiplier?: number;   // circuit-breaker soft throttle, default 1
}

export interface SizingOutput {
  notionalUsd: number;
  quantity: number;
  riskUsd: number;
  reason: string;
}

export const SIZING = {
  MAX_RISK_PER_TRADE: 0.015, // 1.5%
  MAX_POSITION_PCT: 0.25,    // 25% cap
  MAX_TOTAL_EXPOSURE: 0.80,  // 80% equity deployable
};

export function calculatePositionSize(input: SizingInput): SizingOutput {
  const mult = input.sizingMultiplier ?? 1;
  const stopDistance = Math.abs(input.entryPrice - input.stopLoss);

  if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
    return { notionalUsd: 0, quantity: 0, riskUsd: 0, reason: 'invalid stop distance' };
  }
  if (input.equity <= 0) {
    return { notionalUsd: 0, quantity: 0, riskUsd: 0, reason: 'no equity' };
  }

  // 1) Half-Kelly fraction
  const wr = clamp(input.historicalWinRate, 0, 1);
  const r = Math.max(input.avgWinLossRatio, 0.01);
  const kelly = wr - (1 - wr) / r;
  const halfKelly = Math.max(kelly, 0) / 2;

  // 2) Risk-based sizing: USD notional such that stop-out loses max %
  const riskBudget = input.equity * SIZING.MAX_RISK_PER_TRADE * mult;
  const riskBasedQty = riskBudget / stopDistance;
  const riskBasedNotional = riskBasedQty * input.entryPrice;

  // 3) Take the smaller of Half-Kelly and risk-based
  const kellyNotional = input.equity * halfKelly * mult;
  const candidateRaw = halfKelly > 0
    ? Math.min(kellyNotional, riskBasedNotional)
    : riskBasedNotional;

  // 4) Absolute position cap
  const capped = Math.min(candidateRaw, input.equity * SIZING.MAX_POSITION_PCT);

  // 5) Portfolio exposure cap
  const maxNew = Math.max(0, input.equity * SIZING.MAX_TOTAL_EXPOSURE - input.currentExposure);
  const final = Math.min(capped, maxNew);

  if (final <= 0) {
    return { notionalUsd: 0, quantity: 0, riskUsd: 0, reason: 'exposure cap reached' };
  }

  const quantity = final / input.entryPrice;
  const riskUsd = quantity * stopDistance;
  return {
    notionalUsd: final,
    quantity,
    riskUsd,
    reason: 'ok',
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
