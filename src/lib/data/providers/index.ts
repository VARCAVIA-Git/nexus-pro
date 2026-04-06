// ═══════════════════════════════════════════════════════════════
// MARKET DATA PROVIDERS
// Priority: Alpaca Data API (real volume) → CoinGecko/TwelveData fallback
// ═══════════════════════════════════════════════════════════════

export { TwelveDataProvider } from './twelve-data';
export type { TwelveDataConfig } from './twelve-data';
export { CoinGeckoProvider } from './coingecko';
export type { CoinGeckoConfig } from './coingecko';
export { fetchAlpacaBars, fetchAlpacaCryptoBars, fetchAlpacaStockBars } from './alpaca-data';

import type { OHLCV, Timeframe } from '@/types';
import { fetchAlpacaBars } from './alpaca-data';
import { TwelveDataProvider } from './twelve-data';
import { CoinGeckoProvider } from './coingecko';

function isCrypto(symbol: string): boolean {
  return symbol.includes('/');
}

export interface CandleResult {
  candles: OHLCV[];
  volumeReliable: boolean;
  source: 'alpaca' | 'coingecko' | 'twelvedata';
}

/**
 * Unified market data fetcher.
 * Priority: Alpaca (real volume) → CoinGecko/TwelveData (fallback)
 */
export class MarketDataRouter {
  private twelveData: TwelveDataProvider;
  private coinGecko: CoinGeckoProvider;

  constructor() {
    this.twelveData = new TwelveDataProvider();
    this.coinGecko = new CoinGeckoProvider();
  }

  /** Get OHLCV candles with volume reliability flag */
  async getCandlesWithMeta(symbol: string, timeframe: Timeframe, limit = 200): Promise<CandleResult> {
    // Try Alpaca first (has real volume for both crypto and stocks)
    const alpacaCandles = await fetchAlpacaBars(symbol, timeframe, limit);
    if (alpacaCandles.length >= 20) {
      console.log(`[DATA] ${symbol} ${timeframe}: ${alpacaCandles.length} candles from Alpaca (real volume)`);
      return { candles: alpacaCandles, volumeReliable: true, source: 'alpaca' };
    }

    // Fallback
    if (isCrypto(symbol)) {
      const daysMap: Record<Timeframe, number> = { '1m': 1, '5m': 1, '15m': 1, '1h': 2, '4h': 14, '1d': 90, '1w': 365 };
      const candles = await this.coinGecko.getCandles(symbol, daysMap[timeframe] ?? 90);
      console.log(`[DATA] ${symbol} ${timeframe}: ${candles.length} candles from CoinGecko (NO real volume)`);
      return { candles, volumeReliable: false, source: 'coingecko' };
    }

    const candles = await this.twelveData.getCandles(symbol, timeframe, limit);
    console.log(`[DATA] ${symbol} ${timeframe}: ${candles.length} candles from TwelveData (real volume)`);
    return { candles, volumeReliable: true, source: 'twelvedata' };
  }

  /** Legacy: get candles without meta (backward compat) */
  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<OHLCV[]> {
    const { candles } = await this.getCandlesWithMeta(symbol, timeframe, limit);
    return candles;
  }

  async getPrice(symbol: string) {
    if (isCrypto(symbol)) {
      const data = await this.coinGecko.getPrice(symbol);
      return { price: data.price, change: data.change24h, changePct: data.changePct24h };
    }
    return this.twelveData.getPrice(symbol);
  }

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

let _router: MarketDataRouter | null = null;
export function getMarketDataRouter(): MarketDataRouter {
  if (!_router) _router = new MarketDataRouter();
  return _router;
}
