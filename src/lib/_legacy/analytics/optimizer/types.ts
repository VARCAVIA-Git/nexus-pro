// ═══════════════════════════════════════════════════════════════
// Genetic Optimizer — Types
//
// A genome encodes a trading strategy as a combination of
// active indicators, their parameters, and risk settings.
// The GA evolves populations of genomes to find optimal strategies.
// ═══════════════════════════════════════════════════════════════

/**
 * Each indicator can be active/inactive with configurable params.
 * The GA toggles and tunes these to find optimal combinations.
 */
export interface IndicatorGene {
  active: boolean;
  params: Record<string, number>;
}

/**
 * A genome represents a complete trading strategy.
 * The GA evolves these through selection, crossover, mutation.
 */
export interface StrategyGenome {
  id: string;
  /** Which indicators are active and their parameters */
  indicators: {
    sma_cross: IndicatorGene;     // SMA fast/slow crossover
    ema_cross: IndicatorGene;     // EMA fast/slow crossover
    rsi: IndicatorGene;           // RSI overbought/oversold
    macd: IndicatorGene;          // MACD histogram cross
    bollinger: IndicatorGene;     // BB breakout/reversion
    stochastic: IndicatorGene;    // Stoch K/D cross
    adx: IndicatorGene;           // ADX trend strength filter
    cci: IndicatorGene;           // CCI overbought/oversold
    williamsR: IndicatorGene;     // Williams %R extremes
    mfi: IndicatorGene;           // MFI overbought/oversold
    psar: IndicatorGene;          // Parabolic SAR direction
    ichimoku: IndicatorGene;      // Ichimoku cloud position
    keltner: IndicatorGene;       // Keltner channel breakout
    squeezeMom: IndicatorGene;    // Squeeze momentum direction
    cmf: IndicatorGene;           // Chaikin Money Flow direction
    obv_trend: IndicatorGene;     // OBV trend confirmation
    vwap: IndicatorGene;          // VWAP position
    volume_spike: IndicatorGene;  // Volume spike confirmation
    supertrend: IndicatorGene;    // SuperTrend direction
  };
  /** Risk/reward parameters */
  tpAtrMultiplier: number;    // Take profit = ATR × this (1.5 - 5.0)
  slAtrMultiplier: number;    // Stop loss = ATR × this (0.5 - 3.0)
  trailingStopPct: number;    // Trailing stop % (0 = disabled, 0.5 - 5.0)
  minConfidence: number;      // Minimum signal confidence to enter (0.3 - 0.9)
  /** Backtest results (filled after evaluation) */
  fitness: number;
  winRate: number;
  profitFactor: number;
  sharpe: number;
  calmar: number;
  totalTrades: number;
  netProfitPct: number;
  maxDrawdownPct: number;
}

/** Configuration for the genetic algorithm */
export interface GAConfig {
  populationSize: number;     // 50-200
  generations: number;        // 50-300
  tournamentSize: number;     // 3-7
  crossoverRate: number;      // 0.5-0.9
  mutationRate: number;       // 0.05-0.25
  eliteCount: number;         // 1-5 (best individuals preserved)
  minTrades: number;          // Minimum trades for valid genome (20+)
  trainSplit: number;         // Train/test split (0.6-0.8)
  fitnessWeights: {
    sharpe: number;
    calmar: number;
    profitFactor: number;
    winRate: number;
  };
}

export const DEFAULT_GA_CONFIG: GAConfig = {
  populationSize: 80,
  generations: 150,
  tournamentSize: 5,
  crossoverRate: 0.7,
  mutationRate: 0.15,
  eliteCount: 3,
  minTrades: 20,
  trainSplit: 0.7,
  fitnessWeights: {
    sharpe: 0.3,
    calmar: 0.2,
    profitFactor: 0.3,
    winRate: 0.2,
  },
};

/** Result of a GA optimization run */
export interface GAResult {
  bestGenome: StrategyGenome;
  topGenomes: StrategyGenome[];    // Top 5
  generationsRun: number;
  totalEvaluations: number;
  convergenceGen: number;          // Generation where fitness plateaued
  trainMetrics: { sharpe: number; pf: number; wr: number };
  testMetrics: { sharpe: number; pf: number; wr: number };
  elapsedMs: number;
}

/** Default parameter ranges for each indicator gene */
export const INDICATOR_RANGES: Record<string, Record<string, [number, number]>> = {
  sma_cross: { fast: [5, 20], slow: [20, 100] },
  ema_cross: { fast: [5, 21], slow: [21, 55] },
  rsi: { period: [7, 21], overbought: [65, 85], oversold: [15, 35] },
  macd: { fast: [8, 16], slow: [20, 30], signal: [6, 12] },
  bollinger: { period: [15, 30], std: [1.5, 3.0] },
  stochastic: { period: [10, 21], smooth: [2, 5] },
  adx: { period: [10, 20], threshold: [20, 35] },
  cci: { period: [14, 30], overbought: [100, 200], oversold: [-200, -100] },
  williamsR: { period: [10, 21], overbought: [-20, -5], oversold: [-95, -80] },
  mfi: { period: [10, 21], overbought: [70, 90], oversold: [10, 30] },
  psar: { step: [0.01, 0.04], max: [0.1, 0.3] },
  ichimoku: { tenkan: [7, 12], kijun: [22, 30] },
  keltner: { period: [15, 25], mult: [1.0, 2.5] },
  squeezeMom: { threshold: [0, 0] }, // Binary: squeeze or not
  cmf: { period: [15, 25], threshold: [0.05, 0.2] },
  obv_trend: { period: [10, 30] },
  vwap: { deviation: [1.0, 2.5] },
  volume_spike: { threshold: [1.3, 2.5] },
  supertrend: { period: [7, 14], multiplier: [2.0, 4.0] },
};
