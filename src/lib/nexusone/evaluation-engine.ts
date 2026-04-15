// ═══════════════════════════════════════════════════════════════
// NexusOne — Evaluation Engine
//
// Measures real performance vs research expectations.
// Produces GO/NO-GO verdicts.
// Auto-disables strategy if drift is severe.
// ═══════════════════════════════════════════════════════════════

import type { DriftReport, TradeResult, OrderAttempt } from './types';
import { getActiveStrategy } from './strategy-registry';
import { getRecentTrades, getRecentOrders } from './execution-engine';
import { triggerKillSwitch } from './risk-engine';
import { redisSet, redisLpush } from '@/lib/db/redis';
import { nanoid } from 'nanoid';

const KEY_DRIFT_LOG = 'nexusone:eval:drift_reports';
const KEY_LATEST_DRIFT = 'nexusone:eval:latest';
const MAX_REPORTS = 100;

// ─── Thresholds ──────────────────────────────────────────────

const THRESHOLDS = {
  min_fill_rate: 0.5,             // 50% of orders must fill
  max_avg_slippage_bps: 15,       // max 15bps avg slippage
  min_signal_per_week: 1,         // at least 1 signal per week expected
  max_signal_per_day: 10,         // more than 10/day = something wrong
  edge_warning_bps: 0,            // warning if net edge < 0
  edge_kill_after_n: 20,          // kill after 20 trades with negative edge
};

// ─── Evaluate ────────────────────────────────────────────────

/**
 * Run evaluation on recent data. Produces a DriftReport.
 * Called periodically by the eval worker (every 15min-1h).
 */
export async function runEvaluation(): Promise<DriftReport> {
  const strategy = await getActiveStrategy();
  const trades = await getRecentTrades(50);
  const orders = await getRecentOrders(100);

  const strategyId = strategy?.id ?? 'none';
  const closedTrades = trades.filter(t => t.status === 'closed');
  const filledOrders = orders.filter(o => o.fill_status === 'filled');
  const totalOrders = orders.filter(o => o.fill_status !== 'pending');

  const now = Date.now();
  const windowStart = closedTrades.length > 0
    ? Math.min(...closedTrades.map(t => t.entry_ts))
    : now - 86400_000;

  // Metrics
  const tradeCount = closedTrades.length;
  const grossBpsMean = tradeCount > 0
    ? closedTrades.reduce((s, t) => s + t.gross_bps, 0) / tradeCount
    : 0;
  const netBpsMean = tradeCount > 0
    ? closedTrades.reduce((s, t) => s + t.net_bps, 0) / tradeCount
    : 0;
  const winRate = tradeCount > 0
    ? closedTrades.filter(t => t.net_bps > 0).length / tradeCount
    : 0;
  const fillRate = totalOrders.length > 0
    ? filledOrders.length / totalOrders.length
    : 1; // no orders = no problem
  const slippageMean = filledOrders.length > 0
    ? filledOrders.reduce((s, o) => s + o.slippage_bps, 0) / filledOrders.length
    : 0;

  // Signal count (from orders, not trades — orders = attempts)
  const signalCount = orders.length;

  // Drift flags
  const edgePositive = tradeCount < 5 || netBpsMean > THRESHOLDS.edge_warning_bps;
  const fillRateOk = totalOrders.length < 5 || fillRate >= THRESHOLDS.min_fill_rate;
  const slippageOk = filledOrders.length < 5 || slippageMean <= THRESHOLDS.max_avg_slippage_bps;
  const signalFreqOk = true; // will be checked with longer history

  // GO/NO-GO
  const reasons: string[] = [];
  let verdict: DriftReport['go_no_go'] = 'GO';

  if (!edgePositive) {
    reasons.push(`net edge ${netBpsMean.toFixed(1)}bps < 0 over ${tradeCount} trades`);
    if (tradeCount >= THRESHOLDS.edge_kill_after_n) {
      verdict = 'NO_GO';
      await triggerKillSwitch(`evaluation: negative edge after ${tradeCount} trades`);
    } else {
      verdict = 'WARNING';
    }
  }
  if (!fillRateOk) {
    reasons.push(`fill rate ${(fillRate * 100).toFixed(0)}% < ${(THRESHOLDS.min_fill_rate * 100).toFixed(0)}%`);
    verdict = verdict === 'GO' ? 'WARNING' : verdict;
  }
  if (!slippageOk) {
    reasons.push(`avg slippage ${slippageMean.toFixed(1)}bps > ${THRESHOLDS.max_avg_slippage_bps}bps`);
    verdict = verdict === 'GO' ? 'WARNING' : verdict;
  }

  if (verdict === 'GO' && tradeCount >= 5) {
    reasons.push('all metrics within bounds');
  }
  if (tradeCount < 5) {
    reasons.push(`insufficient data (${tradeCount} trades, need 5+)`);
    verdict = 'WARNING';
  }

  const report: DriftReport = {
    strategy_id: strategyId,
    window_start: windowStart,
    window_end: now,
    trades: tradeCount,
    gross_bps_mean: Math.round(grossBpsMean * 100) / 100,
    net_bps_mean: Math.round(netBpsMean * 100) / 100,
    win_rate: Math.round(winRate * 1000) / 1000,
    fill_rate: Math.round(fillRate * 1000) / 1000,
    slippage_mean_bps: Math.round(slippageMean * 100) / 100,
    signal_count: signalCount,
    edge_positive: edgePositive,
    fill_rate_ok: fillRateOk,
    slippage_ok: slippageOk,
    signal_frequency_ok: signalFreqOk,
    go_no_go: verdict,
    reasons,
    created_at: now,
  };

  // Save
  await redisSet(KEY_LATEST_DRIFT, report, 86400);
  await redisLpush(KEY_DRIFT_LOG, report, MAX_REPORTS);

  console.log(`[nexusone-eval] ${verdict}: trades=${tradeCount} net=${netBpsMean.toFixed(1)}bps wr=${(winRate * 100).toFixed(0)}% fill=${(fillRate * 100).toFixed(0)}%`);

  return report;
}

/** Get the latest drift report. */
export async function getLatestDrift(): Promise<DriftReport | null> {
  return redisGet<DriftReport>(KEY_LATEST_DRIFT);
}

import { redisGet } from '@/lib/db/redis';
