// ═══════════════════════════════════════════════════════════════
// Historical Data Loader — downloads real OHLCV from Binance (crypto) + Twelve Data (stocks)
// Binance public klines API works without auth (read-only market data)
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { redisSet, redisGet } from '@/lib/db/redis';

const BINANCE_URL = 'https://api.binance.com/api/v3';
const TD_URL = 'https://api.twelvedata.com';

const BINANCE_SYMBOLS: Record<string, string> = {
  'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT',
  'AVAX/USD': 'AVAXUSDT', 'LINK/USD': 'LINKUSDT', 'DOT/USD': 'DOTUSDT',
};

const TF_MAP_BINANCE: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
const TF_MAP_TD: Record<string, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day' };
const CACHE_TTL: Record<string, number> = { '1m': 3600, '5m': 21600, '15m': 43200, '1h': 86400, '4h': 259200, '1d': 604800 };

// Rate limiter for Twelve Data
let lastTDCall = 0;
async function throttleTD() {
  const gap = Date.now() - lastTDCall;
  if (gap < 8000) await new Promise(r => setTimeout(r, 8000 - gap));
  lastTDCall = Date.now();
}

export async function downloadCryptoHistory(asset: string, tf: string): Promise<OHLCV[]> {
  const symbol = BINANCE_SYMBOLS[asset]; if (!symbol) return [];
  const interval = TF_MAP_BINANCE[tf]; if (!interval) return [];

  try {
    const res = await fetch(`${BINANCE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=1000`);
    if (!res.ok) return [];
    const data: any[][] = await res.json();

    return data.map(k => ({
      date: new Date(k[0]).toISOString().slice(0, 19),
      open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch { return []; }
}

export async function downloadStockHistory(asset: string, tf: string): Promise<OHLCV[]> {
  const key = process.env.TWELVE_DATA_API_KEY; if (!key) return [];
  const interval = TF_MAP_TD[tf]; if (!interval) return [];
  await throttleTD();

  try {
    const res = await fetch(`${TD_URL}/time_series?symbol=${asset}&interval=${interval}&outputsize=500&apikey=${key}`);
    if (!res.ok) return [];
    const d = await res.json();
    if (d.status === 'error' || !d.values) return [];
    return d.values.reverse().map((v: any) => ({
      date: v.datetime, open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: parseInt(v.volume) || 0,
    }));
  } catch { return []; }
}

export async function downloadHistory(asset: string, tf: string): Promise<{ candles: OHLCV[]; source: string }> {
  const cacheKey = `nexus:history:${asset}:${tf}`;

  // Check cache
  try {
    const cached = await redisGet<OHLCV[]>(cacheKey);
    if (cached && cached.length > 50) return { candles: cached, source: 'cache' };
  } catch {}

  const isCrypto = asset.includes('/');
  const candles = isCrypto ? await downloadCryptoHistory(asset, tf) : await downloadStockHistory(asset, tf);

  if (candles.length > 20) {
    await redisSet(cacheKey, candles, CACHE_TTL[tf] ?? 86400);
  }

  return { candles, source: isCrypto ? 'binance' : 'twelvedata' };
}

export const TRAINABLE_ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA'];
export const TRAINABLE_TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
