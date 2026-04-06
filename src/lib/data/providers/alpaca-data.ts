// ═══════════════════════════════════════════════════════════════
// ALPACA DATA — Market data with REAL volume for crypto + stocks
// Uses Alpaca Data API (included free with paper/live account)
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';

const ALPACA_DATA_URL = 'https://data.alpaca.markets';

function getHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
  };
}

function tfToAlpaca(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1Min', '5m': '5Min', '15m': '15Min', '30m': '30Min',
    '1h': '1Hour', '4h': '4Hour', '1d': '1Day', '1w': '1Week',
  };
  return map[tf] ?? '1Hour';
}

/** Fetch crypto bars with REAL volume from Alpaca */
export async function fetchAlpacaCryptoBars(symbol: string, timeframe: string, limit = 200): Promise<OHLCV[]> {
  const headers = getHeaders();
  if (!headers['APCA-API-KEY-ID']) return [];

  const encoded = encodeURIComponent(symbol);
  const tf = tfToAlpaca(timeframe);
  const url = `${ALPACA_DATA_URL}/v1beta3/crypto/us/bars?symbols=${encoded}&timeframe=${tf}&limit=${limit}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.log(`[ALPACA DATA] Crypto ${symbol} ${tf}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const bars = data.bars?.[symbol] ?? [];

    return bars.map((b: any) => ({
      date: b.t ? new Date(b.t).toISOString().slice(0, 19) : '',
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v, // REAL VOLUME
    }));
  } catch (err: any) {
    console.log(`[ALPACA DATA] Crypto error: ${err.message}`);
    return [];
  }
}

/** Fetch stock bars with REAL volume from Alpaca */
export async function fetchAlpacaStockBars(symbol: string, timeframe: string, limit = 200): Promise<OHLCV[]> {
  const headers = getHeaders();
  if (!headers['APCA-API-KEY-ID']) return [];

  const tf = tfToAlpaca(timeframe);
  const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=${tf}&limit=${limit}&adjustment=split`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.log(`[ALPACA DATA] Stock ${symbol} ${tf}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const bars = data.bars ?? [];

    return bars.map((b: any) => ({
      date: b.t ? new Date(b.t).toISOString().slice(0, 19) : '',
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v, // REAL VOLUME
    }));
  } catch (err: any) {
    console.log(`[ALPACA DATA] Stock error: ${err.message}`);
    return [];
  }
}

/** Unified fetch — routes crypto vs stock */
export async function fetchAlpacaBars(symbol: string, timeframe: string, limit = 200): Promise<OHLCV[]> {
  return symbol.includes('/')
    ? fetchAlpacaCryptoBars(symbol, timeframe, limit)
    : fetchAlpacaStockBars(symbol, timeframe, limit);
}
