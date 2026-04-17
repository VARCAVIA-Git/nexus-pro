// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Evaluation Engine
//
// Go / Warning / No-Go verdict from a trade set. Thresholds come
// from the v2 spec and are final — tuning happens by rejecting
// verdicts manually, not by lowering the bar in code.
// ═══════════════════════════════════════════════════════════════

import { listRecentTrades } from '../core/position-manager';
import type { TradeRecord } from '../persistence/dual-writer';

export interface EvaluationResult {
  decision: 'GO' | 'WARNING' | 'NO_GO';
  metrics: {
    totalTrades: number;
    winRate: number;        // 0..1
    profitFactor: number;   // gross wins / |gross losses|
    maxDrawdownPct: number; // negative number
    avgTradeReturnPct: number;
    fillRate: number;       // 0..1 — fraction of non-simulated trades
    avgSlippageBps: number | null;
  };
  reasons: string[];
}

export const EVAL_THRESHOLDS = {
  MIN_TRADES_GO: 30,
  MIN_TRADES_WARNING: 10,
  MIN_WIN_RATE: 0.45,
  MIN_PROFIT_FACTOR: 1.2,
  MAX_DRAWDOWN: -0.08,
  MIN_FILL_RATE: 0.90,
  MIN_WIN_RATE_NOGO: 0.35,
  MIN_PROFIT_FACTOR_NOGO: 1.0,
  MAX_DRAWDOWN_NOGO: -0.10,
};

export async function evaluate(windowDays: number = 7): Promise<EvaluationResult> {
  const sinceMs = Date.now() - windowDays * 86_400_000;
  const all = await listRecentTrades(500);
  const trades = all.filter(t => t.closed_at && Date.parse(t.closed_at) >= sinceMs);
  return evaluateTrades(trades);
}

export function evaluateTrades(trades: TradeRecord[]): EvaluationResult {
  const reasons: string[] = [];
  const total = trades.length;
  const wins = trades.filter(t => (t.net_pnl ?? 0) > 0);
  const losses = trades.filter(t => (t.net_pnl ?? 0) <= 0);

  const winRate = total > 0 ? wins.length / total : 0;

  const grossWins = wins.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + (t.net_pnl ?? 0), 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  const avgTradeReturnPct = total > 0
    ? trades.reduce((s, t) => s + (t.pnl_percent ?? 0), 0) / total / 100
    : 0;

  const realTrades = trades.filter(t => !t.is_simulated);
  const fillRate = total > 0 ? realTrades.length / total : 0;

  // Max drawdown: compute cumulative PnL and track peak-to-trough.
  let running = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    running += t.net_pnl ?? 0;
    if (running > peak) peak = running;
    const dd = peak > 0 ? (running - peak) / peak : 0;
    if (dd < maxDd) maxDd = dd;
  }

  const metrics = {
    totalTrades: total,
    winRate,
    profitFactor,
    maxDrawdownPct: maxDd,
    avgTradeReturnPct,
    fillRate,
    avgSlippageBps: null,
  };

  // No-Go
  if (total < EVAL_THRESHOLDS.MIN_TRADES_WARNING) reasons.push(`only ${total} trades (<${EVAL_THRESHOLDS.MIN_TRADES_WARNING})`);
  if (winRate < EVAL_THRESHOLDS.MIN_WIN_RATE_NOGO) reasons.push(`win rate ${(winRate * 100).toFixed(1)}% <${EVAL_THRESHOLDS.MIN_WIN_RATE_NOGO * 100}%`);
  if (profitFactor < EVAL_THRESHOLDS.MIN_PROFIT_FACTOR_NOGO) reasons.push(`profit factor ${profitFactor.toFixed(2)} <${EVAL_THRESHOLDS.MIN_PROFIT_FACTOR_NOGO}`);
  if (maxDd < EVAL_THRESHOLDS.MAX_DRAWDOWN_NOGO) reasons.push(`drawdown ${(maxDd * 100).toFixed(2)}% < ${EVAL_THRESHOLDS.MAX_DRAWDOWN_NOGO * 100}%`);
  const hardBreaches = reasons.length;

  if (hardBreaches > 0) {
    return { decision: 'NO_GO', metrics, reasons };
  }

  // Go
  const allGo =
    total >= EVAL_THRESHOLDS.MIN_TRADES_GO &&
    winRate >= EVAL_THRESHOLDS.MIN_WIN_RATE &&
    profitFactor >= EVAL_THRESHOLDS.MIN_PROFIT_FACTOR &&
    maxDd >= EVAL_THRESHOLDS.MAX_DRAWDOWN &&
    fillRate >= EVAL_THRESHOLDS.MIN_FILL_RATE;

  if (allGo) return { decision: 'GO', metrics, reasons: ['all thresholds met'] };

  if (total < EVAL_THRESHOLDS.MIN_TRADES_GO) reasons.push(`need ${EVAL_THRESHOLDS.MIN_TRADES_GO - total} more trades`);
  if (winRate < EVAL_THRESHOLDS.MIN_WIN_RATE) reasons.push(`win rate borderline (${(winRate * 100).toFixed(1)}%)`);
  if (profitFactor < EVAL_THRESHOLDS.MIN_PROFIT_FACTOR) reasons.push(`profit factor borderline (${profitFactor.toFixed(2)})`);
  if (fillRate < EVAL_THRESHOLDS.MIN_FILL_RATE) reasons.push(`fill rate borderline (${(fillRate * 100).toFixed(1)}%)`);
  return { decision: 'WARNING', metrics, reasons };
}
