// ═══════════════════════════════════════════════════════════════
// NexusOne Data — Market Data Adapter
//
// Single entry point for all market data needed by NexusOne.
// Currently supports:
//   - OHLCV bars: Alpaca Data API (crypto + stocks)
//   - Funding rates: Binance public API
//   - Live price: Alpaca latest trades
//
// All functions return typed data or empty arrays on failure.
// No exceptions thrown to callers — errors are logged and degraded.
// ═══════════════════════════════════════════════════════════════

import { fetchFundingRateValues } from './binance-funding';

/** Raw bar from data provider (before NexusOne enrichment). */
export interface RawBar {
  ts_open: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const ALPACA_DATA = 'https://data.alpaca.markets';

function alpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
  };
}

function tfToAlpaca(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1Min', '5m': '5Min', '15m': '15Min', '30m': '30Min',
    '1h': '1Hour', '4h': '4Hour', '1d': '1Day',
  };
  return map[tf] ?? '5Min';
}

function isCrypto(symbol: string): boolean {
  return symbol.includes('/') || symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL');
}

// ─── OHLCV Bars ──────────────────────────────────────────────

/**
 * Fetch OHLCV bars from Alpaca.
 * Returns oldest-first, with volume.
 */
export async function fetchBars(
  symbol: string,
  timeframe: string = '5m',
  limit: number = 200,
): Promise<RawBar[]> {
  const headers = alpacaHeaders();
  if (!headers['APCA-API-KEY-ID']) return [];

  const tf = tfToAlpaca(timeframe);
  const end = new Date();
  const start = new Date(end.getTime() - limit * 5 * 60 * 1000 * 2); // 2x buffer

  const crypto = isCrypto(symbol);
  const encoded = encodeURIComponent(symbol);

  const base = crypto
    ? `${ALPACA_DATA}/v1beta3/crypto/us/bars`
    : `${ALPACA_DATA}/v2/stocks/${encoded}/bars`;

  const params = new URLSearchParams({
    timeframe: tf,
    start: start.toISOString(),
    end: end.toISOString(),
    limit: String(limit),
    ...(crypto ? { symbols: symbol } : {}),
  });

  try {
    const url = crypto
      ? `${base}?${params}`
      : `${base}?${params}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[DATA] Bars ${symbol} ${tf}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const bars = crypto ? (data.bars?.[symbol] ?? []) : (data.bars ?? []);

    return bars.map((b: any) => ({
      ts_open: new Date(b.t).getTime(),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));
  } catch (err: any) {
    console.error(`[DATA] Bars error: ${err.message}`);
    return [];
  }
}

// ─── Funding Rates ───────────────────────────────────────────

/**
 * Fetch funding rate values from Binance.
 * Returns oldest-first array of rate values.
 */
export async function fetchFunding(
  symbol: string,
  limit: number = 100,
): Promise<number[]> {
  return fetchFundingRateValues(symbol, limit);
}

// ─── Live Price ──────────────────────────────────────────────

/**
 * Get the latest trade price from Alpaca.
 */
export async function fetchLivePrice(symbol: string): Promise<number> {
  const headers = alpacaHeaders();
  if (!headers['APCA-API-KEY-ID']) return 0;

  const crypto = isCrypto(symbol);
  const encoded = encodeURIComponent(symbol);

  try {
    const url = crypto
      ? `${ALPACA_DATA}/v1beta3/crypto/us/latest/trades?symbols=${encoded}`
      : `${ALPACA_DATA}/v2/stocks/${encoded}/trades/latest`;
    const res = await fetch(url, { headers });
    if (!res.ok) return 0;
    const data = await res.json();
    return crypto
      ? (data.trades?.[symbol]?.p ?? 0)
      : (data.trade?.p ?? 0);
  } catch {
    return 0;
  }
}

// ─── Data Quality ────────────────────────────────────────────

export interface DataQuality {
  bars_count: number;
  bars_expected: number;
  bars_ok: boolean;
  funding_count: number;
  funding_ok: boolean;
  latest_bar_age_s: number;
  stale: boolean;
  price: number;
  price_ok: boolean;
}

/**
 * Check data quality for a symbol.
 * Returns a quality report — used by health checks.
 */
export async function checkDataQuality(symbol: string): Promise<DataQuality> {
  const [bars, funding, price] = await Promise.all([
    fetchBars(symbol, '5m', 50),
    fetchFunding(symbol, 30),
    fetchLivePrice(symbol),
  ]);

  const now = Date.now();
  const latestBarAge = bars.length > 0
    ? Math.round((now - bars[bars.length - 1].ts_open) / 1000)
    : Infinity;

  return {
    bars_count: bars.length,
    bars_expected: 50,
    bars_ok: bars.length >= 30,
    funding_count: funding.length,
    funding_ok: funding.length >= 10,
    latest_bar_age_s: latestBarAge,
    stale: latestBarAge > 600, // stale if last bar > 10 min old
    price,
    price_ok: price > 0,
  };
}
