// ═══════════════════════════════════════════════════════════════
// NexusOne Data — Market Data Adapter (Multi-Provider)
//
// Provider priority:
//   1. OKX (primary for crypto: candles, funding, price, OI)
//   2. Alpaca (fallback for crypto, primary for stocks + execution)
//
// All functions degrade gracefully — return empty on failure.
// ═══════════════════════════════════════════════════════════════

import {
  fetchOkxCandles, fetchOkxFundingHistory, fetchOkxFundingRate,
  fetchOkxPrice, fetchOkxOpenInterest,
} from './okx';

export interface RawBar {
  ts_open: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function isCrypto(symbol: string): boolean {
  return symbol.includes('/') || symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL');
}

// ─── Alpaca (fallback for bars, primary for stocks) ──────────

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

async function fetchAlpacaBars(symbol: string, timeframe: string, limit: number): Promise<RawBar[]> {
  const headers = alpacaHeaders();
  if (!headers['APCA-API-KEY-ID']) return [];

  const tf = tfToAlpaca(timeframe);
  const end = new Date();
  const start = new Date(end.getTime() - limit * 5 * 60_000 * 2);
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
    const res = await fetch(`${base}?${params}`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    const bars = crypto ? (data.bars?.[symbol] ?? []) : (data.bars ?? []);
    return bars.map((b: any) => ({
      ts_open: new Date(b.t).getTime(),
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }));
  } catch { return []; }
}

async function fetchAlpacaPrice(symbol: string): Promise<number> {
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
    return crypto ? (data.trades?.[symbol]?.p ?? 0) : (data.trade?.p ?? 0);
  } catch { return 0; }
}

// ─── Public API: Bars ────────────────────────────────────────

/**
 * Fetch OHLCV bars. OKX primary for crypto, Alpaca fallback.
 */
export async function fetchBars(
  symbol: string,
  timeframe: string = '5m',
  limit: number = 100,
): Promise<RawBar[]> {
  if (isCrypto(symbol)) {
    // Try OKX first
    const okxBars = await fetchOkxCandles(symbol, timeframe, limit);
    if (okxBars.length > 0) {
      return okxBars.map(b => ({
        ts_open: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }));
    }
    console.warn(`[DATA] OKX candles failed for ${symbol}, falling back to Alpaca`);
  }
  return fetchAlpacaBars(symbol, timeframe, limit);
}

// ─── Public API: Funding ─────────────────────────────────────

/**
 * Fetch funding rate history. OKX only (Binance geo-blocked).
 */
export async function fetchFunding(
  symbol: string,
  limit: number = 100,
): Promise<number[]> {
  return fetchOkxFundingHistory(symbol, limit);
}

/**
 * Get current funding rate.
 */
export async function fetchCurrentFunding(symbol: string): Promise<number | null> {
  return fetchOkxFundingRate(symbol);
}

// ─── Public API: Live Price ──────────────────────────────────

/**
 * Get latest price. OKX primary for crypto, Alpaca fallback.
 */
export async function fetchLivePrice(symbol: string): Promise<number> {
  if (isCrypto(symbol)) {
    const okxPrice = await fetchOkxPrice(symbol);
    if (okxPrice > 0) return okxPrice;
    console.warn(`[DATA] OKX price failed for ${symbol}, falling back to Alpaca`);
  }
  return fetchAlpacaPrice(symbol);
}

// ─── Public API: Open Interest ───────────────────────────────

export async function fetchOpenInterest(symbol: string): Promise<number> {
  const oi = await fetchOkxOpenInterest(symbol);
  return oi?.oiCcy ?? 0;
}

// ─── Data Quality ────────────────────────────────────────────

export interface DataQuality {
  bars_count: number;
  bars_expected: number;
  bars_ok: boolean;
  bars_source: string;
  funding_count: number;
  funding_ok: boolean;
  latest_bar_age_s: number;
  stale: boolean;
  price: number;
  price_ok: boolean;
  price_source: string;
  open_interest: number;
}

export async function checkDataQuality(symbol: string): Promise<DataQuality> {
  const [bars, funding, price, oi] = await Promise.all([
    fetchBars(symbol, '5m', 50),
    fetchFunding(symbol, 30),
    fetchLivePrice(symbol),
    fetchOpenInterest(symbol),
  ]);

  const now = Date.now();
  const latestBarAge = bars.length > 0
    ? Math.round((now - bars[bars.length - 1].ts_open) / 1000)
    : Infinity;

  // Detect source (OKX timestamps are round ms, Alpaca are ISO-derived)
  const barsSource = bars.length > 0 && bars[0].ts_open % 1000 === 0 ? 'OKX' : 'Alpaca';
  const priceSource = price > 0 ? (isCrypto(symbol) ? 'OKX' : 'Alpaca') : 'none';

  return {
    bars_count: bars.length,
    bars_expected: 50,
    bars_ok: bars.length >= 30,
    bars_source: barsSource,
    funding_count: funding.length,
    funding_ok: funding.length >= 10,
    latest_bar_age_s: latestBarAge,
    stale: latestBarAge > 600,
    price,
    price_ok: price > 0,
    price_source: priceSource,
    open_interest: oi,
  };
}
