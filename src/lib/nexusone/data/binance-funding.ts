// ═══════════════════════════════════════════════════════════════
// NexusOne Data — Binance Funding Rates
//
// Fetches funding rate history from Binance public API.
// No API key required (public endpoint).
// Rate limit: 2400 req/min (generous).
//
// Binance pays funding every 8h. We fetch the most recent N rates
// and convert to a time series for S1's z-score calculation.
// ═══════════════════════════════════════════════════════════════

export interface FundingRate {
  symbol: string;
  rate: number;       // e.g. 0.0001 = 0.01%
  time: number;       // epoch ms
}

const BINANCE_FAPI = 'https://fapi.binance.com';

const NO_CACHE = {
  cache: 'no-store' as RequestCache,
  next: { revalidate: 0 },
  headers: { 'Cache-Control': 'no-cache' },
};

/**
 * Map NexusOne symbols to Binance futures symbols.
 * Alpaca uses BTC/USD, Binance uses BTCUSDT.
 */
function toBinanceSymbol(symbol: string): string {
  const map: Record<string, string> = {
    'BTC/USD': 'BTCUSDT',
    'BTC-USD': 'BTCUSDT',
    'ETH/USD': 'ETHUSDT',
    'ETH-USD': 'ETHUSDT',
    'SOL/USD': 'SOLUSDT',
    'SOL-USD': 'SOLUSDT',
  };
  return map[symbol] ?? symbol.replace(/[/-]/g, '').replace('USD', 'USDT');
}

/**
 * Fetch recent funding rates from Binance.
 * Returns rates sorted oldest-first (ascending time).
 *
 * @param symbol NexusOne symbol (e.g. 'BTC-USD')
 * @param limit  Number of funding periods to fetch (max 1000, default 100)
 */
export async function fetchFundingRates(
  symbol: string,
  limit: number = 100,
): Promise<FundingRate[]> {
  const binanceSymbol = toBinanceSymbol(symbol);
  const url = `${BINANCE_FAPI}/fapi/v1/fundingRate?symbol=${binanceSymbol}&limit=${limit}`;

  try {
    const res = await fetch(url, NO_CACHE);
    if (!res.ok) {
      console.error(`[BINANCE] Funding ${binanceSymbol}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error(`[BINANCE] Funding ${binanceSymbol}: unexpected response`);
      return [];
    }

    return data.map((item: any) => ({
      symbol,
      rate: parseFloat(item.fundingRate),
      time: item.fundingTime,
    }));
  } catch (err: any) {
    console.error(`[BINANCE] Funding error: ${err.message}`);
    return [];
  }
}

/**
 * Get just the rate values as a number array (for z-score).
 * Returns oldest-first.
 */
export async function fetchFundingRateValues(
  symbol: string,
  limit: number = 100,
): Promise<number[]> {
  const rates = await fetchFundingRates(symbol, limit);
  return rates.map(r => r.rate);
}

/**
 * Get the current (most recent) funding rate.
 */
export async function fetchCurrentFundingRate(
  symbol: string,
): Promise<number | null> {
  const rates = await fetchFundingRates(symbol, 1);
  return rates.length > 0 ? rates[rates.length - 1].rate : null;
}
