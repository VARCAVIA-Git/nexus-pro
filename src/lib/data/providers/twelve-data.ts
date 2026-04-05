// ═══════════════════════════════════════════════════════════════
// TWELVE DATA — Market data provider for stocks
// https://twelvedata.com/docs
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Timeframe } from '@/types';

const BASE_URL = 'https://api.twelvedata.com';

function mapTimeframe(tf: Timeframe): string {
  const map: Record<Timeframe, string> = {
    '1m': '1min', '5m': '5min', '15m': '15min',
    '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week',
  };
  return map[tf] ?? '1day';
}

export interface TwelveDataConfig {
  apiKey: string;
}

export class TwelveDataProvider {
  private apiKey: string;

  constructor(config?: TwelveDataConfig) {
    this.apiKey = config?.apiKey ?? process.env.TWELVE_DATA_API_KEY ?? '';
  }

  /** Fetch OHLCV bars for a stock symbol */
  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<OHLCV[]> {
    const interval = mapTimeframe(timeframe);
    const url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${limit}&apikey=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Twelve Data API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();

    if (data.status === 'error') {
      throw new Error(`Twelve Data: ${data.message}`);
    }

    const values: Array<{
      datetime: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }> = data.values ?? [];

    // Twelve Data returns newest first — reverse to chronological order
    return values.reverse().map((v) => ({
      date: v.datetime.slice(0, 10),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseInt(v.volume, 10) || 0,
    }));
  }

  /** Get current price for a stock */
  async getPrice(symbol: string): Promise<{ price: number; change: number; changePct: number }> {
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Twelve Data API error ${res.status}`);

    const data = await res.json();
    return {
      price: parseFloat(data.close),
      change: parseFloat(data.change),
      changePct: parseFloat(data.percent_change),
    };
  }

  /** Get prices for multiple stocks */
  async getPrices(symbols: string[]): Promise<Record<string, { price: number; change: number; changePct: number }>> {
    const joined = symbols.join(',');
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(joined)}&apikey=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Twelve Data API error ${res.status}`);

    const data = await res.json();
    const result: Record<string, { price: number; change: number; changePct: number }> = {};

    if (Array.isArray(data)) {
      for (const item of data) {
        result[item.symbol] = {
          price: parseFloat(item.close),
          change: parseFloat(item.change),
          changePct: parseFloat(item.percent_change),
        };
      }
    } else if (data.symbol) {
      result[data.symbol] = {
        price: parseFloat(data.close),
        change: parseFloat(data.change),
        changePct: parseFloat(data.percent_change),
      };
    }

    return result;
  }
}
