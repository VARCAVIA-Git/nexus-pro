// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Strategy Registry
//
// Returns the set of strategies that are allowed to evaluate in
// the current regime. The orchestrator uses this to filter.
// ═══════════════════════════════════════════════════════════════

import type { Strategy } from './strategy.interface';
import type { Regime } from '../core/regime-detector';
import { S1_MeanReversion } from './s1-mean-reversion';
import { S2_MomentumBreak } from './s2-momentum-break';
import { S3_StockOvernight } from './s3-stock-overnight';

export const ALL_STRATEGIES: readonly Strategy[] = [
  S1_MeanReversion,
  S2_MomentumBreak,
  S3_StockOvernight,
];

export function getStrategy(id: string): Strategy | undefined {
  return ALL_STRATEGIES.find(s => s.id === id);
}

export function getActiveStrategies(regime: Regime): Strategy[] {
  return ALL_STRATEGIES.filter(s => s.activeRegimes.includes(regime));
}

export function getCryptoStrategies(regime: Regime): Strategy[] {
  return getActiveStrategies(regime).filter(s => s.id !== 'S3_STOCK_OVERNIGHT_V1');
}

export function getStockStrategies(): Strategy[] {
  return ALL_STRATEGIES.filter(s => s.id === 'S3_STOCK_OVERNIGHT_V1');
}
