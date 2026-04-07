// ═══════════════════════════════════════════════════════════════
// Multi-Timeframe Data Fetcher — Alpaca primary, CoinGecko/TD fallback
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import type { TFKey } from '@/types/intelligence';
import { redisGet, redisSet } from '@/lib/db/redis';
import { fetchAlpacaBars } from '@/lib/data/providers/alpaca-data';

const TD_URL = 'https://api.twelvedata.com';
const CG_URL = 'https://api.coingecko.com/api/v3';
const COIN_MAP: Record<string, string> = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot' };

function isCrypto(s: string) { return s.includes('/'); }

const CACHE_TTL: Record<TFKey, number> = { '15m': 300, '1h': 900, '4h': 3600, '1d': 21600, '1w': 43200 };
const TD_INTERVAL: Record<TFKey, string> = { '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
const CG_DAYS: Record<TFKey, number> = { '15m': 1, '1h': 2, '4h': 14, '1d': 90, '1w': 365 };

let lastTDRequest = 0;
async function throttleTD(): Promise<void> {
  const gap = Date.now() - lastTDRequest;
  if (gap < 8000) await new Promise(r => setTimeout(r, 8000 - gap));
  lastTDRequest = Date.now();
}

export async function fetchMTFCandles(symbol: string, tf: TFKey): Promise<OHLCV[]> {
  const cacheKey = `nexus:ohlcv:${symbol}:${tf}`;

  try {
    const cached = await redisGet<OHLCV[]>(cacheKey);
    if (cached && cached.length > 20) return cached;
  } catch {}

  // Try Alpaca first (real volume, both crypto + stocks)
  let candles = await fetchAlpacaBars(symbol, tf, 200);

  // Fallback if Alpaca returns too few
  if (candles.length < 20) {
    if (isCrypto(symbol)) {
      const id = COIN_MAP[symbol];
      if (id) {
        try {
          const r = await fetch(`${CG_URL}/coins/${id}/ohlc?vs_currency=usd&days=${CG_DAYS[tf] ?? 14}`);
          if (r.ok) {
            const data: number[][] = await r.json();
            candles = data.map(d => ({ date: new Date(d[0]).toISOString().slice(0, 19), open: d[1], high: d[2], low: d[3], close: d[4], volume: 0 }));
          }
        } catch {}
      }
    } else {
      const key = process.env.TWELVE_DATA_API_KEY;
      if (key) {
        await throttleTD();
        try {
          const r = await fetch(`${TD_URL}/time_series?symbol=${symbol}&interval=${TD_INTERVAL[tf]}&outputsize=200&apikey=${key}`);
          if (r.ok) { const d = await r.json(); if (d.values) candles = d.values.reverse().map((v: any) => ({ date: v.datetime, open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: parseInt(v.volume) || 0 })); }
        } catch {}
      }
    }
  }

  if (candles.length > 20) {
    redisSet(cacheKey, candles, CACHE_TTL[tf]).catch(() => {});
  }

  return candles;
}

export async function fetchAllTimeframes(symbol: string): Promise<Record<TFKey, OHLCV[]>> {
  const tfs: TFKey[] = ['1w', '1d', '4h', '1h', '15m'];
  const result: Partial<Record<TFKey, OHLCV[]>> = {};
  for (const tf of tfs) { result[tf] = await fetchMTFCandles(symbol, tf); }
  return result as Record<TFKey, OHLCV[]>;
}
