// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Data Validators
//
// Freshness and cross-source sanity checks. A bar older than
// MAX_BAR_AGE_MS or a price disagreement over MAX_PRICE_DEV is
// treated as a fatal tick-skip condition.
// ═══════════════════════════════════════════════════════════════

import type { OHLCVBar } from './feature-engine';

export const MAX_BAR_AGE_MS_DEFAULT = 90_000; // 90s tolerance for 15m bars (tick period + buffer)
export const MAX_PRICE_DEVIATION = 0.005; // 0.5%

export function latestBarAgeMs(bars: OHLCVBar[], now: number): number {
  if (bars.length === 0) return Infinity;
  return now - bars[bars.length - 1].ts;
}

export function isFreshEnough(bars: OHLCVBar[], timeframeMin: number, now: number): boolean {
  if (bars.length === 0) return false;
  // Allow up to one full bar + 30s: a 15m bar closes every 15*60=900s and the
  // public OKX endpoint reports it within seconds. We accept `timeframeMin + 1min`.
  const maxAge = (timeframeMin + 1) * 60_000;
  return latestBarAgeMs(bars, now) <= maxAge;
}

export function priceWithinBand(a: number, b: number, tolerance: number = MAX_PRICE_DEVIATION): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / ((a + b) / 2) <= tolerance;
}
