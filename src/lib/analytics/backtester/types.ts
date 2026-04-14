// ═══════════════════════════════════════════════════════════════
// Full Backtester — Types
//
// Realistic Wall-Street-grade backtesting types.
// Every trade is simulated with real capital, SL/TP, trailing,
// commissions, entry timeouts, and failed-entry tracking.
// ═══════════════════════════════════════════════════════════════

import type { StrategyKey } from '@/types';

// ── Configuration ────────────────────────────────────────────

export interface BacktestConfig {
  /** Starting capital in USD */
  initialCapital: number;
  /** Fixed size per trade in USD */
  tradeSize: number;
  /** Commission per trade as fraction (e.g. 0.001 = 0.1%) */
  commissionRate: number;
  /** Slippage per trade as fraction (e.g. 0.0005 = 0.05%) */
  slippageRate: number;
  /** Max concurrent open positions */
  maxConcurrentPositions: number;
  /** Enable trailing stop */
  useTrailingStop: boolean;
  /** Trailing stop activation: close position after price retraces this % from peak */
  trailingStopPct: number;
  /** Max bars to wait for entry condition to trigger (limit order simulation) */
  entryTimeoutBars: number;
  /** If true, test mined rules as strategies in addition to coded ones */
  includeMineRules: boolean;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 1_000,       // Phase 6: realistic $1k capital
  tradeSize: 30,               // Phase 6: $30 per trade (3% of capital)
  commissionRate: 0.001,       // 0.1% per side
  slippageRate: 0.0003,        // 0.03% per side
  maxConcurrentPositions: 3,   // Phase 6: max 3 concurrent (less over-exposure)
  useTrailingStop: true,
  trailingStopPct: 0.012,      // Phase 6: 1.2% trailing (tighter)
  entryTimeoutBars: 8,         // Phase 6: 8 bars timeout (faster stale)
  includeMineRules: true,
};

// ── Timeframes ───────────────────────────────────────────────

export type BacktestTimeframe = '15m' | '1h' | '4h';

// Phase 6: removed 5m — too noisy, commissions eat all profit
export const BACKTEST_TIMEFRAMES: BacktestTimeframe[] = ['15m', '1h', '4h'];

// ── Individual Trade ─────────────────────────────────────────

export type TradeOutcome = 'tp_hit' | 'sl_hit' | 'trailing_exit' | 'timeout' | 'signal_exit';
export type EntryStatus = 'filled' | 'expired' | 'cancelled';

export interface BacktestTrade {
  id: number;
  strategyId: string;
  timeframe: BacktestTimeframe;
  direction: 'long' | 'short';

  // Entry
  entryStatus: EntryStatus;
  entryPrice: number | null;
  entryBar: number;
  entryTime: string;

  // Exit (null if entry never filled)
  exitPrice: number | null;
  exitBar: number | null;
  exitTime: string | null;
  outcome: TradeOutcome | null;

  // Sizing
  quantity: number;
  sizeUsd: number;

  // Targets (set at entry from historical averages)
  stopLoss: number;
  takeProfit: number;
  stopLossPct: number;
  takeProfitPct: number;

  // P&L
  grossPnl: number;
  commission: number;
  slippage: number;
  netPnl: number;
  netPnlPct: number;

  // Duration
  holdingBars: number;

  // Signal metadata
  confidence: number;
  conditions?: string[];
}

// ── Per-Strategy-Timeframe Result ────────────────────────────

export interface StrategyTimeframeResult {
  strategyId: string;
  strategyName: string;
  timeframe: BacktestTimeframe;
  /** Is this a mined rule or a coded strategy */
  isMineRule: boolean;
  /** Conditions if mined rule */
  conditions?: string[];

  // Volume
  totalSignals: number;
  totalEntries: number;
  filledEntries: number;
  expiredEntries: number;
  /** % of entries that actually got filled */
  fillRate: number;

  // Performance
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;

  // P&L
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  netProfitPct: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgWinPct: number;
  avgLossPct: number;
  bestTrade: number;
  worstTrade: number;
  expectancy: number;

  // Risk
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  calmar: number;

  // Timing
  avgHoldingBars: number;
  avgHoldingHours: number;

  // TP/SL statistics (historical averages for bot calibration)
  avgTpDistance: number;
  avgSlDistance: number;
  avgTpDistancePct: number;
  avgSlDistancePct: number;
  tpHitRate: number;
  slHitRate: number;
  trailingExitRate: number;
  timeoutRate: number;

  // Optimal entry timeout (bars before signal becomes stale)
  optimalEntryTimeout: number;

  // Equity curve snapshots (for charting)
  equityCurve: number[];

  // Ranking score (composite)
  rankScore: number;
}

// ── Full Backtest Report ─────────────────────────────────────

export interface BacktestReport {
  symbol: string;
  generatedAt: number;
  config: BacktestConfig;
  /** Total candles analyzed per timeframe */
  candleCounts: Record<BacktestTimeframe, number>;
  /** Date range of the backtest */
  dateRange: { start: string; end: string };

  /** All strategy-timeframe combinations, sorted by rankScore desc */
  results: StrategyTimeframeResult[];

  /** Top 5 overall (best rankScore) */
  topStrategies: Array<{
    rank: number;
    strategyId: string;
    strategyName: string;
    timeframe: BacktestTimeframe;
    netProfitPct: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    maxDrawdownPct: number;
    sharpe: number;
  }>;

  /** Global stats */
  globalStats: {
    totalStrategiesTested: number;
    totalTradesSimulated: number;
    bestNetProfit: number;
    bestWinRate: number;
    bestSharpe: number;
    avgProfitFactor: number;
  };
}
