// ═══════════════════════════════════════════════════════════════
// V2.0 — Trading Intelligence System
//
// Modules:
//   regime-detector      — Probabilistic regime detection
//   distribution-forecaster — Empirical quantile forecasting
//   dynamic-kelly        — Position sizing with drawdown control
//   trade-brain          — Central decision engine + meta-learning
// ═══════════════════════════════════════════════════════════════

export { detectRegime } from './regime-detector';
export type { RegimeState, RegimeType, RegimeProbabilities } from './regime-detector';

export { buildDistributionProfile } from './distribution-forecaster';
export type {
  DistributionProfile,
  ConditionDistribution,
  TradeSetup,
  ForecastHorizons,
  QuantileDistribution,
} from './distribution-forecaster';

export { calculateSize, buildPortfolioState } from './dynamic-kelly';
export type { SizingResult, PortfolioState } from './dynamic-kelly';

export { decide, updateMeta, createEmptyMeta } from './trade-brain';
export type { TradeDecision, MetaState, MetaEntry } from './trade-brain';
