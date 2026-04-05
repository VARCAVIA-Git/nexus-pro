// ═══════════════════════════════════════════════════════════════
// COINGECKO — Market data provider for crypto
// https://docs.coingecko.com/reference/introduction
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';

const BASE_URL = 'https://api.coingecko.com/api/v3';
const PRO_URL = 'https://pro-api.coingecko.com/api/v3';

/** Map common crypto symbols to CoinGecko IDs */
const SYMBOL_TO_ID: Record<string, string> = {
  'BTC/USD': 'bitcoin',
  'ETH/USD': 'ethereum',
  'SOL/USD': 'solana',
  'AVAX/USD': 'avalanche-2',
  'LINK/USD': 'chainlink',
  'DOT/USD': 'polkadot',
  'ADA/USD': 'cardano',
  'MATIC/USD': 'matic-network',
  'DOGE/USD': 'dogecoin',
  'XRP/USD': 'ripple',
  'ATOM/USD': 'cosmos',
  'UNI/USD': 'uniswap',
};

export interface CoinGeckoConfig {
  apiKey?: string;
  usePro?: boolean;
}

export class CoinGeckoProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config?: CoinGeckoConfig) {
    this.apiKey = config?.apiKey ?? process.env.COINGECKO_API_KEY ?? '';
    this.baseUrl = (config?.usePro || this.apiKey) ? PRO_URL : BASE_URL;
  }

  private async request<T>(path: string): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const keyParam = this.apiKey ? `${separator}x_cg_pro_api_key=${this.apiKey}` : '';
    const url = `${this.baseUrl}${path}${keyParam}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CoinGecko API error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  /** Convert symbol like "BTC/USD" to CoinGecko ID */
  private resolveId(symbol: string): string {
    return SYMBOL_TO_ID[symbol] ?? symbol.split('/')[0].toLowerCase();
  }

  /** Fetch OHLCV data for a crypto asset */
  async getCandles(symbol: string, days = 90): Promise<OHLCV[]> {
    const id = this.resolveId(symbol);
    const data = await this.request<number[][]>(
      `/coins/${id}/ohlc?vs_currency=usd&days=${days}`,
    );

    return data.map((d) => {
      const date = new Date(d[0]);
      return {
        date: date.toISOString().slice(0, 10),
        open: d[1],
        high: d[2],
        low: d[3],
        close: d[4],
        volume: 0, // OHLC endpoint doesn't include volume
      };
    });
  }

  /** Get current price for a crypto asset */
  async getPrice(symbol: string): Promise<{
    price: number;
    change24h: number;
    changePct24h: number;
    volume24h: number;
    marketCap: number;
  }> {
    const id = this.resolveId(symbol);
    const data = await this.request<Record<string, {
      usd: number;
      usd_24h_change: number;
      usd_24h_vol: number;
      usd_market_cap: number;
    }>>(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`);

    const coin = data[id];
    if (!coin) throw new Error(`CoinGecko: coin not found — ${id}`);

    const price = coin.usd;
    const changePct = coin.usd_24h_change;
    const change = price * (changePct / 100);

    return {
      price,
      change24h: change,
      changePct24h: changePct,
      volume24h: coin.usd_24h_vol,
      marketCap: coin.usd_market_cap,
    };
  }

  /** Get prices for multiple crypto assets */
  async getPrices(symbols: string[]): Promise<Record<string, {
    price: number;
    change24h: number;
    changePct24h: number;
    volume24h: number;
  }>> {
    const ids = symbols.map((s) => this.resolveId(s)).join(',');
    const data = await this.request<Record<string, {
      usd: number;
      usd_24h_change: number;
      usd_24h_vol: number;
    }>>(`/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`);

    const result: Record<string, { price: number; change24h: number; changePct24h: number; volume24h: number }> = {};

    for (const symbol of symbols) {
      const id = this.resolveId(symbol);
      const coin = data[id];
      if (coin) {
        result[symbol] = {
          price: coin.usd,
          change24h: coin.usd * (coin.usd_24h_change / 100),
          changePct24h: coin.usd_24h_change,
          volume24h: coin.usd_24h_vol,
        };
      }
    }

    return result;
  }

  /** Get market data with sparkline for multiple coins */
  async getMarketData(symbols: string[], sparklineDays = 7): Promise<Array<{
    symbol: string;
    price: number;
    changePct24h: number;
    volume24h: number;
    marketCap: number;
    sparkline: number[];
  }>> {
    const ids = symbols.map((s) => this.resolveId(s)).join(',');
    const data = await this.request<Array<{
      id: string;
      current_price: number;
      price_change_percentage_24h: number;
      total_volume: number;
      market_cap: number;
      sparkline_in_7d?: { price: number[] };
    }>>(`/coins/markets?vs_currency=usd&ids=${ids}&sparkline=${sparklineDays > 0}&order=market_cap_desc`);

    // Map CoinGecko IDs back to our symbol format
    const idToSymbol: Record<string, string> = {};
    for (const symbol of symbols) {
      idToSymbol[this.resolveId(symbol)] = symbol;
    }

    return data.map((d) => ({
      symbol: idToSymbol[d.id] ?? d.id,
      price: d.current_price,
      changePct24h: d.price_change_percentage_24h,
      volume24h: d.total_volume,
      marketCap: d.market_cap,
      sparkline: d.sparkline_in_7d?.price ?? [],
    }));
  }
}
