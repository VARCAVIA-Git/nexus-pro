// ═══════════════════════════════════════════════════════════════
// V2.0 — Dynamic Kelly + Drawdown Control
//
// Position sizing that adapts to:
//   1. Trade quality (confidence × R:R)
//   2. Current drawdown (reduce when losing)
//   3. Volatility regime (less in high vol)
//   4. Portfolio heat (total exposure)
//
// Uses fractional Kelly (25%) with drawdown scaling and vol targeting.
// ═══════════════════════════════════════════════════════════════

import type { TradeSetup } from './distribution-forecaster';
import type { RegimeState } from './regime-detector';

export interface SizingResult {
  fractionOfCapital: number;   // 0-1: what % of capital to risk
  positionSizeUsd: number;     // actual $ size
  kellyRaw: number;            // raw Kelly fraction
  kellyAdjusted: number;       // after all adjustments
  drawdownPenalty: number;     // multiplier applied for drawdown (0-1)
  volatilityScale: number;     // multiplier for volatility (0-1)
  reason: string;
}

export interface PortfolioState {
  equity: number;
  peakEquity: number;          // all-time high
  currentDrawdownPct: number;  // (peak - current) / peak × 100
  openPositionCount: number;
  totalExposurePct: number;    // sum of position sizes / equity × 100
}

// ── Configuration ────────────────────────────────────────────

const KELLY_FRACTION = 0.25;          // Use 25% of Kelly (conservative)
const MAX_POSITION_PCT = 0.08;        // Never more than 8% of capital per trade
const MIN_POSITION_PCT = 0.005;       // Below 0.5% = not worth the commission

// Drawdown scaling thresholds
const DD_MILD = 5;                     // >5% DD → reduce by 25%
const DD_MODERATE = 10;                // >10% DD → reduce by 50%
const DD_SEVERE = 20;                  // >20% DD → reduce by 75%
const DD_CRITICAL = 30;               // >30% DD → stop trading

// Volatility regime scaling
const VOL_REGIME_SCALE: Record<string, number> = {
  TRENDING: 1.0,       // full size in trends
  RANGING: 0.8,        // slightly smaller in ranges
  VOLATILE: 0.5,       // half size in volatile
  ACCUMULATING: 0.6,   // smaller during accumulation
};

// Max total portfolio exposure
const MAX_TOTAL_EXPOSURE_PCT = 25;     // Never more than 25% of capital in total

/**
 * Calculate optimal position size using Dynamic Kelly.
 */
export function calculateSize(
  setup: TradeSetup,
  regime: RegimeState,
  portfolio: PortfolioState,
): SizingResult {
  const noTrade = (reason: string): SizingResult => ({
    fractionOfCapital: 0,
    positionSizeUsd: 0,
    kellyRaw: 0,
    kellyAdjusted: 0,
    drawdownPenalty: 0,
    volatilityScale: 0,
    reason,
  });

  // ── 1. Basic Kelly calculation ──────────────────────────

  // Estimate win probability from confidence + R:R
  // Higher R:R means we can afford lower WR
  const estimatedWR = Math.min(0.7, setup.confidence * 0.8 + 0.2);
  const avgWin = setup.tpPct;
  const avgLoss = setup.slPct;

  if (avgWin <= 0 || avgLoss <= 0) return noTrade('invalid TP/SL');

  // Kelly: f = (p × b - q) / b where b = avgWin/avgLoss
  const b = avgWin / avgLoss;
  const kellyRaw = (estimatedWR * b - (1 - estimatedWR)) / b;

  if (kellyRaw <= 0) return noTrade('negative Kelly (edge insufficient)');

  let fraction = kellyRaw * KELLY_FRACTION;

  // ── 2. Drawdown penalty ─────────────────────────────────

  let drawdownPenalty = 1.0;
  const dd = portfolio.currentDrawdownPct;
  if (dd >= DD_CRITICAL) return noTrade(`drawdown ${dd.toFixed(1)}% > ${DD_CRITICAL}% critical`);
  if (dd >= DD_SEVERE) drawdownPenalty = 0.25;
  else if (dd >= DD_MODERATE) drawdownPenalty = 0.5;
  else if (dd >= DD_MILD) drawdownPenalty = 0.75;

  fraction *= drawdownPenalty;

  // ── 3. Volatility regime scaling ────────────────────────

  const volatilityScale = VOL_REGIME_SCALE[regime.dominant] ?? 0.7;
  fraction *= volatilityScale;

  // ── 4. Regime confidence scaling ────────────────────────

  // If regime is unclear, reduce size
  if (!regime.actionable) {
    fraction *= 0.5;
  }

  // ── 5. Portfolio exposure check ─────────────────────────

  const remainingExposure = MAX_TOTAL_EXPOSURE_PCT - portfolio.totalExposurePct;
  if (remainingExposure <= 0) return noTrade('max portfolio exposure reached');

  fraction = Math.min(fraction, remainingExposure / 100);

  // ── 6. Apply caps ───────────────────────────────────────

  fraction = Math.max(MIN_POSITION_PCT, Math.min(fraction, MAX_POSITION_PCT));

  const positionSizeUsd = Math.round(portfolio.equity * fraction * 100) / 100;

  return {
    fractionOfCapital: round4(fraction),
    positionSizeUsd,
    kellyRaw: round4(kellyRaw),
    kellyAdjusted: round4(fraction),
    drawdownPenalty: round4(drawdownPenalty),
    volatilityScale: round4(volatilityScale),
    reason: `kelly=${(kellyRaw * 100).toFixed(1)}% → frac=${(fraction * 100).toFixed(1)}% ($${positionSizeUsd.toFixed(0)})`,
  };
}

/**
 * Build portfolio state from current account info and open mines.
 */
export function buildPortfolioState(
  equity: number,
  peakEquity: number,
  openMines: Array<{ allocatedCapital: number }>,
): PortfolioState {
  const totalExposure = openMines.reduce((s, m) => s + m.allocatedCapital, 0);
  return {
    equity,
    peakEquity: Math.max(equity, peakEquity),
    currentDrawdownPct: peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0,
    openPositionCount: openMines.length,
    totalExposurePct: equity > 0 ? (totalExposure / equity) * 100 : 0,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Export for testing
export const _internals = {
  calculateSize,
  buildPortfolioState,
  KELLY_FRACTION,
  MAX_POSITION_PCT,
  DD_MILD,
  DD_MODERATE,
  DD_SEVERE,
  DD_CRITICAL,
};
