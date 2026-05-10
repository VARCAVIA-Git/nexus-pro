// NexusOne v3 — Orchestrator.
//
// One tick per (asset, tf) bar close. The runtime calls evaluate()
// with the latest bars, and the orchestrator returns:
//   - exits to execute on currently-open positions (SL / TP / time)
//   - new entries (signals from active tuples in the current regime)
//
// The orchestrator is PURE: it does not touch the broker or persistence.
// The caller owns those. The same code runs in backtest and live.

import { precompute } from './indicators';
import { PRIMITIVES_V3 } from './primitives';
import { TupleManagerV3, kellyFraction } from './tuple-manager';
import {
  type RiskConfigV3,
  DEFAULT_RISK_V3,
  type RiskState,
  isHalted,
  recordPnL,
} from './risk';
import {
  type AssetV3,
  type TfV3,
  type BarV3,
  type IndicatorsV3,
  type OpenTradeV3,
  type ClosedTradeV3,
  COST_BPS_RT_V3,
} from './types';

export interface StreamSnapshot {
  asset: AssetV3;
  tf: TfV3;
  bars: BarV3[];
  indicators?: IndicatorsV3; // optional: if not provided we precompute
}

export interface PortfolioState {
  equity: number;
  peakEquity: number;
  maxDrawdownPct: number;
  open: OpenTradeV3[];
  closed: ClosedTradeV3[];
  riskState: RiskState;
  cfg: RiskConfigV3;
}

export interface TickInput {
  stream: StreamSnapshot;
  /** index of the just-closed bar within stream.bars */
  idx: number;
  /** tuple manager (mutated in place) */
  tuples: TupleManagerV3;
  portfolio: PortfolioState;
}

export interface TickResult {
  exits: ClosedTradeV3[];
  entries: OpenTradeV3[];
}

// Evaluate exits on open trades for this stream at bar idx.
// Mutates portfolio.open / portfolio.closed and returns exits performed.
export function evaluateExits(input: TickInput): ClosedTradeV3[] {
  const { stream, idx, portfolio, tuples } = input;
  const bar = stream.bars[idx];
  const exits: ClosedTradeV3[] = [];
  const remaining: OpenTradeV3[] = [];

  for (const o of portfolio.open) {
    if (o.asset !== stream.asset || o.tf !== stream.tf) {
      remaining.push(o);
      continue;
    }
    const elapsed = idx - o.entryBar;
    let exitPrice: number | null = null;
    let reason: 'stop' | 'tp' | 'time' | null = null;

    if (o.dir === 'long') {
      if (bar.low <= o.stopPrice) { exitPrice = o.stopPrice; reason = 'stop'; }
      else if (bar.high >= o.tpPrice) { exitPrice = o.tpPrice; reason = 'tp'; }
    } else {
      if (bar.high >= o.stopPrice) { exitPrice = o.stopPrice; reason = 'stop'; }
      else if (bar.low <= o.tpPrice) { exitPrice = o.tpPrice; reason = 'tp'; }
    }
    if (!exitPrice && elapsed >= o.timeStopBars) { exitPrice = bar.close; reason = 'time'; }

    if (exitPrice && reason) {
      const grossBps = o.dir === 'long'
        ? ((exitPrice - o.entryPrice) / o.entryPrice) * 10000
        : ((o.entryPrice - exitPrice) / o.entryPrice) * 10000;
      const netBps = grossBps - COST_BPS_RT_V3;
      const netDollars = (netBps / 10000) * o.notional;

      const closed: ClosedTradeV3 = {
        ...o, exitBar: idx, exitTs: bar.ts, exitPrice, netBps, netDollars, reason,
      };

      portfolio.equity += netDollars;
      if (portfolio.equity > portfolio.peakEquity) portfolio.peakEquity = portfolio.equity;
      const dd = (portfolio.peakEquity - portfolio.equity) / portfolio.peakEquity;
      if (dd > portfolio.maxDrawdownPct) portfolio.maxDrawdownPct = dd;

      recordPnL(portfolio.riskState, bar.ts, netDollars, portfolio.cfg);
      tuples.update(o.tupleKey, netBps);

      portfolio.closed.push(closed);
      exits.push(closed);
    } else {
      remaining.push(o);
    }
  }
  portfolio.open = remaining;
  return exits;
}

// Try to open a new position on this stream/bar; returns the entry if any.
export function attemptEntry(input: TickInput): OpenTradeV3 | null {
  const { stream, idx, portfolio, tuples } = input;
  const cfg = portfolio.cfg;
  if (portfolio.open.length >= cfg.maxConcurrent) return null;

  const bar = stream.bars[idx];
  if (isHalted(portfolio.riskState, bar.ts, cfg).halted) return null;

  // Avoid pile-on: one open trade per (asset, tf)
  if (portfolio.open.some((o) => o.asset === stream.asset && o.tf === stream.tf)) return null;

  const ind = stream.indicators ?? precompute(stream.bars);
  const curRegime = ind.regime[idx];

  for (const prim of PRIMITIVES_V3) {
    if (!prim.activeRegimes.includes(curRegime)) continue;
    const sig = prim.fn(stream.bars, ind, idx);
    if (!sig) continue;

    const key = `${prim.id}|${stream.asset}|${stream.tf}`;
    const ts = tuples.get(key, prim.id, stream.asset, stream.tf);
    if (!ts.active) continue;

    const a = ind.atr14[idx];
    if (!isFinite(a) || a <= 0) continue;

    const stopDist = sig.stopAtr * a;
    const tpDist = sig.tpAtr * a;
    const stopPrice = sig.dir === 'long' ? sig.entryPrice - stopDist : sig.entryPrice + stopDist;
    const tpPrice = sig.dir === 'long' ? sig.entryPrice + tpDist : sig.entryPrice - tpDist;
    const riskBps = (stopDist / sig.entryPrice) * 10000;
    if (riskBps < 5 || riskBps > 800) continue; // sanity: avoid pathological stops

    const fraction = kellyFraction(ts);
    if (fraction <= 0) continue;

    const notional = fraction * portfolio.equity;

    const entry: OpenTradeV3 = {
      tupleKey: key, asset: stream.asset, tf: stream.tf, primitive: prim.id,
      entryBar: idx, entryTs: bar.ts, entryPrice: sig.entryPrice,
      dir: sig.dir, stopPrice, tpPrice, timeStopBars: sig.timeStopBars,
      notional, riskBps,
    };
    portfolio.open.push(entry);
    return entry;
  }
  return null;
}

export function tick(input: TickInput): TickResult {
  const exits = evaluateExits(input);
  const entry = attemptEntry(input);
  return { exits, entries: entry ? [entry] : [] };
}

export function makeFreshPortfolio(cfg: RiskConfigV3 = DEFAULT_RISK_V3): PortfolioState {
  return {
    equity: cfg.initialEquity,
    peakEquity: cfg.initialEquity,
    maxDrawdownPct: 0,
    open: [],
    closed: [],
    riskState: {
      haltedUntilTs: 0,
      consecutiveLosses: 0,
      dailyPnL: {},
      weeklyPnL: {},
    },
    cfg,
  };
}
