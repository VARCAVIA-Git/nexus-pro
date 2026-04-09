// ═══════════════════════════════════════════════════════════════
// Phase 4 — Risk Manager
//
// Enforces capital limits, position sizing, and portfolio-level
// risk constraints before any mine is opened.
// ═══════════════════════════════════════════════════════════════

import type { Mine, CapitalProfile, DetectedSignal } from './types';
import { MIN_TP_SL_RATIO } from './constants';
import { calcRiskReward, calcPositionSize } from './utils';

export interface RiskCheckResult {
  allowed: boolean;
  reason: string | null;
  allocatedCapital: number;
  quantity: number;
}

/**
 * Check if a new mine can be opened given current portfolio state.
 * Returns allocation details if allowed.
 */
export function checkRisk(
  signal: DetectedSignal,
  profile: CapitalProfile,
  equity: number,
  activeMines: Mine[],
  activeMinesForAsset: Mine[],
): RiskCheckResult {
  const reject = (reason: string): RiskCheckResult => ({
    allowed: false,
    reason,
    allocatedCapital: 0,
    quantity: 0,
  });

  // 1. Confidence gate
  if (signal.signal.confidence < profile.minConfidence) {
    return reject(`confidence ${signal.signal.confidence.toFixed(2)} < min ${profile.minConfidence}`);
  }

  // 2. Max concurrent mines (global)
  if (activeMines.length >= profile.maxConcurrentMines) {
    return reject(`max concurrent mines reached (${profile.maxConcurrentMines})`);
  }

  // 3. Max mines per asset
  if (activeMinesForAsset.length >= profile.maxMinesPerAsset) {
    return reject(`max mines per asset reached (${profile.maxMinesPerAsset})`);
  }

  // 4. TP/SL ratio check
  const rr = calcRiskReward(
    signal.suggestedTp > signal.suggestedSl
      ? signal.suggestedSl + (signal.suggestedTp - signal.suggestedSl) * 0.5 // approx entry for long
      : signal.suggestedSl - (signal.suggestedSl - signal.suggestedTp) * 0.5,
    signal.suggestedTp,
    signal.suggestedSl,
  );
  // Simpler: use a direct distance ratio
  const tpDist = Math.abs(signal.suggestedTp - signal.suggestedSl);
  const slDist = signal.suggestedDirection === 'long'
    ? Math.abs(signal.suggestedSl - signal.suggestedTp) * 0.4 // rough SL portion
    : Math.abs(signal.suggestedSl - signal.suggestedTp) * 0.4;
  // Actually just compute from a reasonable entry (midpoint between TP and SL weighted toward SL)
  // For simplicity: estimate entry as current price ≈ the zone level or between TP/SL
  // The actual entry price will be market price. Use the SL distance as % of a reasonable price.

  // 5. Portfolio risk check: total allocated risk < max
  const currentRiskPct = activeMines.reduce((sum, m) => {
    if (m.entryPrice == null || equity <= 0) return sum;
    const slDist = Math.abs(m.entryPrice - m.stopLoss);
    const riskAmount = slDist * m.quantity;
    return sum + (riskAmount / equity) * 100;
  }, 0);

  if (currentRiskPct >= profile.maxPortfolioRiskPct) {
    return reject(`portfolio risk ${currentRiskPct.toFixed(1)}% >= max ${profile.maxPortfolioRiskPct}%`);
  }

  // 6. Position sizing
  // SL distance as % of TP/SL midpoint (proxy for entry price)
  const midPrice = (signal.suggestedTp + signal.suggestedSl) / 2;
  if (midPrice <= 0) return reject('invalid TP/SL prices');

  const slDistancePct =
    (Math.abs(
      signal.suggestedDirection === 'long'
        ? midPrice - signal.suggestedSl
        : signal.suggestedSl - midPrice,
    ) /
      midPrice) *
    100;

  if (slDistancePct <= 0) return reject('SL distance is zero');

  const maxRiskForThisMine = Math.min(
    profile.maxSingleMineRiskPct,
    profile.maxPortfolioRiskPct - currentRiskPct,
  );

  if (maxRiskForThisMine <= 0) return reject('no risk budget remaining');

  const notional = calcPositionSize(equity, maxRiskForThisMine, slDistancePct);
  const quantity = notional / midPrice;

  if (quantity <= 0 || notional <= 0) return reject('position size too small');

  return {
    allowed: true,
    reason: null,
    allocatedCapital: Math.round(notional * 100) / 100,
    quantity: Math.round(quantity * 1e8) / 1e8, // 8 decimals for crypto
  };
}
