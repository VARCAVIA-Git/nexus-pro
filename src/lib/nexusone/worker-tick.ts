// ═══════════════════════════════════════════════════════════════
// NexusOne — Worker Tick
//
// Single entry point called by the cron worker.
// Replaces the old mine-tick discovery-driven approach.
//
// Flow per tick:
//   1. Check system mode (disabled/paper/live)
//   2. Get active strategy
//   3. Fetch market data (bars + funding)
//   4. Evaluate signal
//   5. Execute if triggered
//   6. Monitor open trade
//   7. Check pending orders
//   8. Periodic evaluation
// ═══════════════════════════════════════════════════════════════

import { getSystemMode, getActiveStrategy } from './strategy-registry';
import { evaluateSignal } from './signal-engine';
import { executeSignal, monitorOpenTrade, closeTrade, checkPendingOrder, getOpenTrade } from './execution-engine';
import { runEvaluation } from './evaluation-engine';
import { getKillSwitch } from './risk-engine';
import type { MarketBar } from './types';

export interface NexusOneTickResult {
  mode: string;
  strategy: string | null;
  kill_switch: boolean;
  signal_evaluated: boolean;
  signal_triggered: boolean;
  trade_open: boolean;
  trade_closed: boolean;
  close_reason: string | null;
  eval_ran: boolean;
  eval_verdict: string | null;
  errors: string[];
  elapsed_ms: number;
}

// Evaluation counter — run eval every ~30 ticks (15min at 30s interval)
let evalCounter = 0;
const EVAL_INTERVAL = 30;

/**
 * Main NexusOne tick. Called every 30s by cron worker.
 */
export async function nexusOneTick(
  fetchBars: () => Promise<MarketBar[]>,
  fetchFunding: () => Promise<number[]>,
  fetchPrice: () => Promise<number>,
): Promise<NexusOneTickResult> {
  const start = Date.now();
  const errors: string[] = [];
  const result: NexusOneTickResult = {
    mode: 'disabled',
    strategy: null,
    kill_switch: false,
    signal_evaluated: false,
    signal_triggered: false,
    trade_open: false,
    trade_closed: false,
    close_reason: null,
    eval_ran: false,
    eval_verdict: null,
    errors: [],
    elapsed_ms: 0,
  };

  try {
    // 1. System mode
    const mode = await getSystemMode();
    result.mode = mode;
    if (mode === 'disabled') {
      result.elapsed_ms = Date.now() - start;
      return result;
    }

    // 2. Active strategy
    const strategy = await getActiveStrategy();
    result.strategy = strategy?.id ?? null;
    if (!strategy) {
      result.elapsed_ms = Date.now() - start;
      return result;
    }

    // 3. Kill switch
    const ks = await getKillSwitch();
    result.kill_switch = ks.triggered;
    if (ks.triggered) {
      result.elapsed_ms = Date.now() - start;
      return result;
    }

    // 4. Check pending limit orders
    try {
      await checkPendingOrder();
    } catch (e: any) {
      errors.push(`pending: ${e.message}`);
    }

    // 5. Monitor open trade
    const openTrade = await getOpenTrade();
    result.trade_open = !!openTrade && openTrade.status === 'open';

    if (result.trade_open) {
      try {
        const price = await fetchPrice();
        const monitor = await monitorOpenTrade(price);
        if (monitor.action === 'close') {
          await closeTrade(price, monitor.reason as any ?? 'time_exit');
          result.trade_closed = true;
          result.close_reason = monitor.reason ?? null;
          result.trade_open = false;
        }
      } catch (e: any) {
        errors.push(`monitor: ${e.message}`);
      }
    }

    // 6. Evaluate signal (only if no open trade and not in cooldown)
    if (!result.trade_open) {
      try {
        const bars = await fetchBars();
        const funding = await fetchFunding();
        const signalResult = await evaluateSignal(bars, funding);
        result.signal_evaluated = signalResult.evaluated;

        if (signalResult.signal) {
          result.signal_triggered = true;
          // Execute
          const execResult = await executeSignal(signalResult.signal);
          if (!execResult.executed) {
            errors.push(`exec: ${execResult.reason}`);
          }
        }
      } catch (e: any) {
        errors.push(`signal: ${e.message}`);
      }
    }

    // 7. Periodic evaluation
    evalCounter++;
    if (evalCounter >= EVAL_INTERVAL) {
      evalCounter = 0;
      try {
        const drift = await runEvaluation();
        result.eval_ran = true;
        result.eval_verdict = drift.go_no_go;
      } catch (e: any) {
        errors.push(`eval: ${e.message}`);
      }
    }

  } catch (e: any) {
    errors.push(`tick: ${e.message}`);
  }

  result.errors = errors;
  result.elapsed_ms = Date.now() - start;
  return result;
}
