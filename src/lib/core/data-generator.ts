import type { OHLCV } from '@/types';

/**
 * Generate realistic OHLCV data using Geometric Brownian Motion (GBM).
 *
 * GBM model: dS = μ·S·dt + σ·S·dW
 * where μ = drift (annualized), σ = volatility (annualized), dW ~ N(0, √dt)
 */
export function generateOHLCV(options: {
  symbol?: string;
  startPrice: number;
  days: number;
  annualDrift?: number;     // default 0.05 (5% annual)
  annualVolatility?: number; // default 0.30 (30% annual)
  startDate?: string;        // ISO date string
  baseVolume?: number;       // average daily volume
  seed?: number;             // for reproducibility
}): OHLCV[] {
  const {
    startPrice,
    days,
    annualDrift = 0.05,
    annualVolatility = 0.30,
    startDate = '2025-01-01',
    baseVolume = 1000000,
    seed,
  } = options;

  const dt = 1 / 252; // daily fraction of year
  const mu = annualDrift;
  const sigma = annualVolatility;
  const candles: OHLCV[] = [];
  let price = startPrice;

  // Seeded random using a simple LCG for reproducibility
  let rngState = seed ?? Math.floor(Math.random() * 2147483647);
  function nextRandom(): number {
    rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
    return rngState / 0x7fffffff;
  }

  // Box-Muller transform for normal distribution
  function normalRandom(): number {
    const u1 = Math.max(nextRandom(), 1e-10);
    const u2 = nextRandom();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const base = new Date(startDate);

  for (let d = 0; d < days; d++) {
    const date = new Date(base);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

    // GBM step
    const dW = normalRandom() * Math.sqrt(dt);
    const dS = mu * dt + sigma * dW;
    const open = price;

    // Simulate intra-day movement with 4 sub-steps
    let high = open;
    let low = open;
    let current = open;

    for (let step = 0; step < 4; step++) {
      const subDW = normalRandom() * Math.sqrt(dt / 4);
      const subDS = (mu * dt / 4) + sigma * subDW;
      current = current * (1 + subDS);
      high = Math.max(high, current);
      low = Math.min(low, current);
    }

    const close = open * (1 + dS);
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);

    // Ensure low > 0
    if (low <= 0) low = open * 0.01;
    if (close <= 0) price = open * 0.5;
    else price = close;

    // Volume with some randomness and occasional spikes
    const volMultiplier = 0.5 + nextRandom() * 1.0;
    const volumeSpike = nextRandom() > 0.9 ? 2 + nextRandom() * 3 : 1;
    const volume = Math.round(baseVolume * volMultiplier * volumeSpike);

    candles.push({
      date: dateStr,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    });
  }

  return candles;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Asset presets for realistic GBM parameters */
export const assetPresets: Record<string, {
  startPrice: number;
  annualDrift: number;
  annualVolatility: number;
  baseVolume: number;
}> = {
  'BTC/USD': { startPrice: 65000, annualDrift: 0.15, annualVolatility: 0.55, baseVolume: 42000000000 / 65000 },
  'ETH/USD': { startPrice: 3400, annualDrift: 0.12, annualVolatility: 0.60, baseVolume: 18000000000 / 3400 },
  'SOL/USD': { startPrice: 180, annualDrift: 0.20, annualVolatility: 0.70, baseVolume: 4200000000 / 180 },
  'AVAX/USD': { startPrice: 40, annualDrift: 0.10, annualVolatility: 0.65, baseVolume: 1100000000 / 40 },
  'LINK/USD': { startPrice: 20, annualDrift: 0.08, annualVolatility: 0.55, baseVolume: 890000000 / 20 },
  'DOT/USD': { startPrice: 7.5, annualDrift: 0.05, annualVolatility: 0.60, baseVolume: 420000000 / 7.5 },
  'AAPL': { startPrice: 195, annualDrift: 0.12, annualVolatility: 0.25, baseVolume: 62000000 },
  'NVDA': { startPrice: 890, annualDrift: 0.25, annualVolatility: 0.45, baseVolume: 45000000 },
  'TSLA': { startPrice: 245, annualDrift: 0.10, annualVolatility: 0.50, baseVolume: 98000000 },
  'MSFT': { startPrice: 425, annualDrift: 0.10, annualVolatility: 0.22, baseVolume: 22000000 },
  'AMZN': { startPrice: 190, annualDrift: 0.12, annualVolatility: 0.28, baseVolume: 34000000 },
  'META': { startPrice: 528, annualDrift: 0.15, annualVolatility: 0.35, baseVolume: 18000000 },
};

/** Generate OHLCV for a known asset using presets */
export function generateAssetOHLCV(
  symbol: string,
  days: number,
  startDate?: string,
  seed?: number,
): OHLCV[] {
  const preset = assetPresets[symbol];
  if (!preset) {
    return generateOHLCV({ startPrice: 100, days, startDate, seed });
  }
  return generateOHLCV({
    symbol,
    startPrice: preset.startPrice,
    days,
    annualDrift: preset.annualDrift,
    annualVolatility: preset.annualVolatility,
    baseVolume: preset.baseVolume,
    startDate,
    seed,
  });
}
