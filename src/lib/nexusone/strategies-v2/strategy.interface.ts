// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Strategy Interface
//
// Strategies are pure functions of (features, regime, context)
// returning at most one Signal per evaluation call. They must
// NOT touch the database, broker, or time — the orchestrator
// owns all side effects.
// ═══════════════════════════════════════════════════════════════

import type { Features, OHLCVBar } from '../core/feature-engine';
import type { Regime } from '../core/regime-detector';

export interface StrategySignal {
  strategyId: string;
  asset: string;          // e.g. 'BTC/USD'
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  timeStopMin: number;    // flatten after this many minutes
  cooldownBars: number;   // bars to wait before next signal (bar = strategy.timeframeMin)
  timeframeMin: number;   // bar length in minutes (15 for S1/S2)
  featuresSnapshot: Record<string, number>;
}

export interface StrategyStats {
  historicalWinRate: number;     // 0..1
  avgWinLossRatio: number;       // avgWin / |avgLoss|
  maxTradesPerDay: number;
}

export interface EvalContext {
  openPositionsForAsset: number; // quantity signed; 0 = flat
  lastSignalTs: number | null;   // ms — for cooldown
  now: number;                   // ms (injected for testability)
  regime: Regime;
  /** Full OHLCV window used by strategies that need lookback beyond Features (e.g. S2 breakout). */
  recentBars?: OHLCVBar[];
}

export interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly timeframeMin: number;
  readonly stats: StrategyStats;
  readonly activeRegimes: readonly Regime[];
  evaluate(asset: string, features: Features, ctx: EvalContext): StrategySignal | null;
}
