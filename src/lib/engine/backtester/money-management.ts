// ═══════════════════════════════════════════════════════════════
// Money Management — position sizing with correlation control
// ═══════════════════════════════════════════════════════════════

export type CorrelationGroup = 'crypto' | 'us_equity' | 'commodities' | 'forex' | 'other';

export const ASSET_GROUPS: Record<string, CorrelationGroup> = {
  // Crypto
  'BTC/USD': 'crypto', 'ETH/USD': 'crypto', 'SOL/USD': 'crypto',
  'AVAX/USD': 'crypto', 'LINK/USD': 'crypto', 'DOT/USD': 'crypto',
  'BTC': 'crypto', 'ETH': 'crypto', 'SOL': 'crypto',
  // US equities
  'AAPL': 'us_equity', 'NVDA': 'us_equity', 'TSLA': 'us_equity',
  'MSFT': 'us_equity', 'AMZN': 'us_equity', 'META': 'us_equity',
  'AMD': 'us_equity', 'GOOGL': 'us_equity',
  // ETFs (still us_equity)
  'SPY': 'us_equity', 'QQQ': 'us_equity',
  // Commodities
  'GLD': 'commodities', 'SLV': 'commodities', 'USO': 'commodities',
};

export function getGroup(asset: string): CorrelationGroup {
  return ASSET_GROUPS[asset] ?? 'other';
}

export interface MMConfig {
  initialCapital: number;
  riskPerTrade: number;        // % of equity per trade (1-2)
  maxTotalExposure: number;    // % of capital across all positions (10)
  maxGroupExposure: number;    // % per correlation group (6)
  maxOpenPositions: number;    // total simultaneous positions (5)
  maxPerAsset: number;         // per single asset (1)
}

export const DEFAULT_MM: MMConfig = {
  initialCapital: 10000,
  riskPerTrade: 1.5,
  maxTotalExposure: 10,
  maxGroupExposure: 6,
  maxOpenPositions: 5,
  maxPerAsset: 1,
};

export interface OpenPosition {
  asset: string;
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  sizeUsd: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  entryBarIndex: number;
  strategy?: string;  // name of the strategy that generated this signal
}

export interface SizingResult {
  approved: boolean;
  reason: string;
  quantity: number;
  sizeUsd: number;
}

/**
 * Calculate position size based on:
 * - 1-2% risk per trade based on stop distance
 * - Max total exposure cap
 * - Max correlation group exposure cap
 * - Max open positions cap
 * - One position per asset
 */
export function sizePosition(
  equity: number,
  asset: string,
  price: number,
  stopDist: number,
  config: MMConfig,
  openPositions: OpenPosition[],
): SizingResult {
  // 1. Already have a position on this asset?
  const onAsset = openPositions.filter(p => p.asset === asset).length;
  if (onAsset >= config.maxPerAsset) {
    return { approved: false, reason: 'asset_already_open', quantity: 0, sizeUsd: 0 };
  }

  // 2. Hit max open positions?
  if (openPositions.length >= config.maxOpenPositions) {
    return { approved: false, reason: 'max_positions', quantity: 0, sizeUsd: 0 };
  }

  // 3. Calculate raw size from risk
  if (stopDist <= 0 || price <= 0) {
    return { approved: false, reason: 'invalid_stop_or_price', quantity: 0, sizeUsd: 0 };
  }
  const riskAmount = equity * (config.riskPerTrade / 100);
  let quantity = riskAmount / stopDist;
  let sizeUsd = quantity * price;

  // 4. Check total exposure cap
  const totalExposure = openPositions.reduce((s, p) => s + p.sizeUsd, 0);
  const maxTotalUsd = equity * (config.maxTotalExposure / 100);
  if (totalExposure + sizeUsd > maxTotalUsd) {
    // Try to fit within remaining
    const remaining = maxTotalUsd - totalExposure;
    if (remaining < equity * 0.01) {
      return { approved: false, reason: 'max_total_exposure', quantity: 0, sizeUsd: 0 };
    }
    sizeUsd = remaining;
    quantity = sizeUsd / price;
  }

  // 5. Check group exposure cap
  const group = getGroup(asset);
  const groupExposure = openPositions
    .filter(p => getGroup(p.asset) === group)
    .reduce((s, p) => s + p.sizeUsd, 0);
  const maxGroupUsd = equity * (config.maxGroupExposure / 100);
  if (groupExposure + sizeUsd > maxGroupUsd) {
    const remaining = maxGroupUsd - groupExposure;
    if (remaining < equity * 0.01) {
      return { approved: false, reason: `max_group_${group}_exposure`, quantity: 0, sizeUsd: 0 };
    }
    sizeUsd = remaining;
    quantity = sizeUsd / price;
  }

  if (sizeUsd < equity * 0.005) {
    return { approved: false, reason: 'size_too_small', quantity: 0, sizeUsd: 0 };
  }

  return { approved: true, reason: 'approved', quantity, sizeUsd };
}
