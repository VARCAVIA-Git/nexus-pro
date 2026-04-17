// ═══════════════════════════════════════════════════════════════
// NexusOne Data — OKX Public API
//
// No auth required. All endpoints are public.
// Rate limit: 20 req/2s per endpoint.
//
// Provides: candles, funding rates, live price, open interest.
// Used as PRIMARY data source (Alpaca as execution + fallback).
// ═══════════════════════════════════════════════════════════════

const OKX_BASE = 'https://www.okx.com/api/v5';

// All OKX fetches MUST bypass Next.js Data Cache — stale data = wrong trades.
const NO_CACHE = {
  cache: 'no-store' as RequestCache,
  next: { revalidate: 0 },
  headers: { 'Cache-Control': 'no-cache' },
};

function toOkxInstId(symbol: string): string {
  const map: Record<string, string> = {
    'BTC/USD': 'BTC-USDT-SWAP',
    'BTC-USD': 'BTC-USDT-SWAP',
    'ETH/USD': 'ETH-USDT-SWAP',
    'ETH-USD': 'ETH-USDT-SWAP',
    'SOL/USD': 'SOL-USDT-SWAP',
    'SOL-USD': 'SOL-USDT-SWAP',
  };
  return map[symbol] ?? 'BTC-USDT-SWAP';
}

function toOkxBar(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '4h': '4H', '1d': '1D',
  };
  return map[tf] ?? '5m';
}

// ─── Candles ─────────────────────────────────────────────────

export interface OkxBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchOkxCandles(
  symbol: string,
  timeframe: string = '5m',
  limit: number = 100,
): Promise<OkxBar[]> {
  const instId = toOkxInstId(symbol);
  const bar = toOkxBar(timeframe);
  const url = `${OKX_BASE}/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;

  try {
    const res = await fetch(url, NO_CACHE);
    if (!res.ok) { console.error(`[OKX] candles ${instId}: HTTP ${res.status}`); return []; }
    const data = await res.json();
    if (data.code !== '0') { console.error(`[OKX] candles error: ${data.msg}`); return []; }

    // OKX returns newest first — reverse to oldest first
    return (data.data ?? []).reverse().map((c: string[]) => ({
      ts: parseInt(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  } catch (err: any) {
    console.error(`[OKX] candles error: ${err.message}`);
    return [];
  }
}

// ─── Funding Rate ────────────────────────────────────────────

export async function fetchOkxFundingRate(symbol: string): Promise<number | null> {
  const instId = toOkxInstId(symbol);
  const url = `${OKX_BASE}/public/funding-rate?instId=${instId}`;

  try {
    const res = await fetch(url, NO_CACHE);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== '0' || !data.data?.length) return null;
    return parseFloat(data.data[0].fundingRate);
  } catch { return null; }
}

export async function fetchOkxFundingHistory(
  symbol: string,
  limit: number = 100,
): Promise<number[]> {
  const instId = toOkxInstId(symbol);
  const url = `${OKX_BASE}/public/funding-rate-history?instId=${instId}&limit=${limit}`;

  try {
    const res = await fetch(url, NO_CACHE);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.code !== '0') return [];
    // Newest first from API, reverse to oldest first
    return (data.data ?? []).reverse().map((r: any) => parseFloat(r.fundingRate));
  } catch { return []; }
}

// ─── Live Price ──────────────────────────────────────────────

export async function fetchOkxPrice(symbol: string): Promise<number> {
  const instId = toOkxInstId(symbol);
  const url = `${OKX_BASE}/market/ticker?instId=${instId}`;

  try {
    const res = await fetch(url, NO_CACHE);
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.code !== '0' || !data.data?.length) return 0;
    return parseFloat(data.data[0].last);
  } catch { return 0; }
}

// ─── Open Interest ───────────────────────────────────────────

export interface OkxOpenInterest {
  oi: number;      // contracts
  oiCcy: number;   // in base currency (BTC)
}

export async function fetchOkxOpenInterest(symbol: string): Promise<OkxOpenInterest | null> {
  const instId = toOkxInstId(symbol);
  const url = `${OKX_BASE}/public/open-interest?instType=SWAP&instId=${instId}`;

  try {
    const res = await fetch(url, NO_CACHE);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== '0' || !data.data?.length) return null;
    return {
      oi: parseFloat(data.data[0].oi),
      oiCcy: parseFloat(data.data[0].oiCcy),
    };
  } catch { return null; }
}
