// ═══════════════════════════════════════════════════════════════
// MARKET DATA PROVIDERS
// - Twelve Data: stocks (AAPL, NVDA, TSLA, etc.)
// - CoinGecko: crypto (BTC/USD, ETH/USD, etc.)
// - Alpaca Data API: fallback for both (via broker)
// ═══════════════════════════════════════════════════════════════

export { TwelveDataProvider } from './twelve-data';
export type { TwelveDataConfig } from './twelve-data';
export { CoinGeckoProvider } from './coingecko';
export type { CoinGeckoConfig } from './coingecko';

import type { OHLCV, Timeframe } from '@/types';
import { TwelveDataProvider } from './twelve-data';
import { CoinGeckoProvider } from './coingecko';

/** Check if a symbol is crypto */
function isCrypto(symbol: string): boolean {
  return symbol.includes('/');
}

/**
 * Unified market data fetcher.
 * Routes crypto to CoinGecko, stocks to Twelve Data.
 */
export class MarketDataRouter {
  private twelveData: TwelveDataProvider;
  private coinGecko: CoinGeckoProvider;

  constructor() {
    this.twelveData = new TwelveDataProvider();
    this.coinGecko = new CoinGeckoProvider();
  }

  /** Get OHLCV candles — auto-routes based on symbol type */
  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<OHLCV[]> {
    if (isCrypto(symbol)) {
      // CoinGecko OHLC endpoint uses days, not bar count
      const daysMap: Record<Timeframe, number> = {
        '1m': 1, '5m': 1, '15m': 1, '1h': 2, '4h': 14, '1d': limit, '1w': limit * 7,
      };
      return this.coinGecko.getCandles(symbol, daysMap[timeframe] ?? 90);
    }
    return this.twelveData.getCandles(symbol, timeframe, limit);
  }

  /** Get current price — auto-routes */
  async getPrice(symbol: string) {
    if (isCrypto(symbol)) {
      const data = await this.coinGecko.getPrice(symbol);
      return { price: data.price, change: data.change24h, changePct: data.changePct24h };
    }
    return this.twelveData.getPrice(symbol);
  }

  /** Get prices for mixed symbols */
  async getPrices(symbols: string[]) {
    const cryptoSymbols = symbols.filter(isCrypto);
    const stockSymbols = symbols.filter((s) => !isCrypto(s));

    const result: Record<string, { price: number; change: number; changePct: number }> = {};

    if (cryptoSymbols.length > 0) {
      const cryptoPrices = await this.coinGecko.getPrices(cryptoSymbols);
      for (const [sym, data] of Object.entries(cryptoPrices)) {
        result[sym] = { price: data.price, change: data.change24h, changePct: data.changePct24h };
      }
    }

    if (stockSymbols.length > 0) {
      const stockPrices = await this.twelveData.getPrices(stockSymbols);
      Object.assign(result, stockPrices);
    }

    return result;
  }
}

/** Singleton instance */
let _router: MarketDataRouter | null = null;
export function getMarketDataRouter(): MarketDataRouter {
  if (!_router) _router = new MarketDataRouter();
  return _router;
}
