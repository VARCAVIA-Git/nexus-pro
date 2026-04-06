// ═══════════════════════════════════════════════════════════════
// Historical Data Loader — Alpaca primary (deep history + real volume)
// Fallbacks: CoinGecko (crypto, no volume), TwelveData (stocks)
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { redisSet, redisGet } from '@/lib/db/redis';

const ALPACA_DATA = 'https://data.alpaca.markets';
const CG_URL = 'https://api.coingecko.com/api/v3';
const TD_URL = 'https://api.twelvedata.com';

const COIN_MAP: Record<string, string> = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot' };
const CG_DAYS: Record<string, number> = { '1m': 1, '5m': 1, '15m': 1, '1h': 2, '4h': 14, '1d': 90, '1w': 365 };
const TF_ALPACA: Record<string, string> = { '1m': '1Min', '5m': '5Min', '15m': '15Min', '1h': '1Hour', '4h': '4Hour', '1d': '1Day', '1w': '1Week' };
const TF_TD: Record<string, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day' };
const CACHE_TTL: Record<string, number> = { '1m': 3600, '5m': 21600, '15m': 43200, '1h': 86400, '4h': 259200, '1d': 604800 };

function isCrypto(asset: string): boolean { return asset.includes('/'); }

function getAlpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
  };
}

// ── Alpaca Data API (primary — real volume, deep history) ──

async function downloadFromAlpaca(asset: string, tf: string, months = 3): Promise<OHLCV[]> {
  const headers = getAlpacaHeaders();
  if (!headers['APCA-API-KEY-ID']) return [];

  const alpacaTF = TF_ALPACA[tf]; if (!alpacaTF) return [];
  const crypto = isCrypto(asset);
  const end = new Date();
  const start = new Date(end.getTime() - months * 30 * 86400000);

  const allCandles: OHLCV[] = [];
  let pageToken: string | null = null;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      timeframe: alpacaTF,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: '10000',
    });
    if (crypto) params.set('symbols', asset);
    if (pageToken) params.set('page_token', pageToken);

    const baseUrl = crypto
      ? `${ALPACA_DATA}/v1beta3/crypto/us/bars`
      : `${ALPACA_DATA}/v2/stocks/${asset}/bars`;

    try {
      const res = await fetch(`${baseUrl}?${params}`, { headers });
      if (!res.ok) { console.log(`[HISTORY] Alpaca ${asset} ${tf}: HTTP ${res.status}`); break; }
      const data = await res.json();

      const bars = crypto ? (data.bars?.[asset] ?? []) : (data.bars ?? []);
      for (const b of bars) {
        allCandles.push({
          date: new Date(b.t).toISOString().slice(0, 19),
          open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
        });
      }

      pageToken = data.next_page_token ?? null;
      pages++;
      if (pages > 10) break; // safety: max 10 pages
      if (pageToken) await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      console.log(`[HISTORY] Alpaca error ${asset}: ${err.message}`);
      break;
    }
  } while (pageToken);

  console.log(`[HISTORY] Alpaca ${asset} ${tf}: ${allCandles.length} candles (${pages} pages)`);
  return allCandles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ── CoinGecko fallback (crypto, no volume) ────────────────

async function downloadFromCoinGecko(asset: string, tf: string): Promise<OHLCV[]> {
  const coinId = COIN_MAP[asset]; if (!coinId) return [];
  const days = CG_DAYS[tf] ?? 14;
  try {
    const res = await fetch(`${CG_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
    if (!res.ok) return [];
    const data: number[][] = await res.json();
    return data.map(k => ({
      date: new Date(k[0]).toISOString().slice(0, 19),
      open: k[1], high: k[2], low: k[3], close: k[4], volume: 0,
    }));
  } catch { return []; }
}

// ── Twelve Data fallback (stocks) ─────────────────────────

let lastTDCall = 0;
async function throttleTD() {
  const gap = Date.now() - lastTDCall;
  if (gap < 8000) await new Promise(r => setTimeout(r, 8000 - gap));
  lastTDCall = Date.now();
}

async function downloadFromTwelveData(asset: string, tf: string): Promise<OHLCV[]> {
  const key = process.env.TWELVE_DATA_API_KEY; if (!key) return [];
  const interval = TF_TD[tf]; if (!interval) return [];
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

// ── Public API ────────────────────────────────────────────

export async function downloadCryptoHistory(asset: string, tf: string): Promise<OHLCV[]> {
  // Alpaca first (real volume + deep history)
  const alpaca = await downloadFromAlpaca(asset, tf, 6);
  if (alpaca.length >= 20) return alpaca;
  // CoinGecko fallback
  return downloadFromCoinGecko(asset, tf);
}

export async function downloadStockHistory(asset: string, tf: string): Promise<OHLCV[]> {
  const alpaca = await downloadFromAlpaca(asset, tf, 6);
  if (alpaca.length >= 20) return alpaca;
  return downloadFromTwelveData(asset, tf);
}

export async function downloadHistory(asset: string, tf: string): Promise<{ candles: OHLCV[]; source: string }> {
  const cacheKey = `nexus:history:${asset}:${tf}`;

  try {
    const cached = await redisGet<OHLCV[]>(cacheKey);
    if (cached && cached.length > 50) return { candles: cached, source: 'cache' };
  } catch {}

  const crypto = isCrypto(asset);
  const candles = crypto ? await downloadCryptoHistory(asset, tf) : await downloadStockHistory(asset, tf);
  const source = candles.length > 0 && candles[0].volume > 0 ? 'alpaca' : crypto ? 'coingecko' : 'twelvedata';

  if (candles.length > 20) {
    await redisSet(cacheKey, candles, CACHE_TTL[tf] ?? 86400);
  }

  return { candles, source };
}

export const TRAINABLE_ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA'];
export const TRAINABLE_TFS = ['1m', '5m', '15m', '1h', '4h', '1d'];
