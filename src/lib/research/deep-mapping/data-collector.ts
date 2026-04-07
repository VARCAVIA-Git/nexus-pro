// ═══════════════════════════════════════════════════════════════
// Deep Mapping — Data Collector
// Downloads complete history from Alpaca on 4 timeframes
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';

const ALPACA_DATA = 'https://data.alpaca.markets';

const TF_MAP: Record<string, string> = {
  '15m': '15Min', '1h': '1Hour', '4h': '4Hour', '1d': '1Day',
};

function isCrypto(asset: string): boolean { return asset.includes('/') || asset === 'BTC' || asset === 'ETH' || asset === 'SOL' || asset === 'AVAX' || asset === 'LINK' || asset === 'DOT'; }

function normalizeAsset(asset: string): string {
  // Accept "BTC" and convert to "BTC/USD" for crypto
  if (!asset.includes('/') && isCrypto(asset)) return `${asset}/USD`;
  return asset;
}

function getHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? process.env.ALPACA_SECRET_KEY ?? '',
  };
}

async function downloadTimeframe(asset: string, tfKey: string, years = 4): Promise<OHLCV[]> {
  const headers = getHeaders();
  if (!headers['APCA-API-KEY-ID']) {
    console.log('[DEEP-MAP] Missing Alpaca API key');
    return [];
  }

  const alpacaTF = TF_MAP[tfKey];
  if (!alpacaTF) return [];

  const symbol = normalizeAsset(asset);
  const crypto = isCrypto(symbol);
  const end = new Date();
  const start = new Date(end.getTime() - years * 365 * 86400000);

  const all: OHLCV[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  const MAX_PAGES = 50;

  do {
    const params = new URLSearchParams({
      timeframe: alpacaTF,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: '10000',
    });
    if (crypto) params.set('symbols', symbol);
    if (pageToken) params.set('page_token', pageToken);

    const baseUrl = crypto
      ? `${ALPACA_DATA}/v1beta3/crypto/us/bars`
      : `${ALPACA_DATA}/v2/stocks/${symbol}/bars`;

    try {
      const res = await fetch(`${baseUrl}?${params}`, { headers });
      if (!res.ok) {
        console.log(`[DEEP-MAP] ${alpacaTF}: HTTP ${res.status}`);
        break;
      }
      const data = await res.json();
      const bars = crypto ? (data.bars?.[symbol] ?? []) : (data.bars ?? []);

      for (const b of bars) {
        all.push({
          date: new Date(b.t).toISOString(),
          open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
        });
      }

      pageToken = data.next_page_token ?? null;
      pages++;
      console.log(`[DEEP-MAP] ${alpacaTF}: ${all.length} candles so far... (page ${pages})`);
      if (pages >= MAX_PAGES) break;
      if (pageToken) await new Promise(r => setTimeout(r, 250));
    } catch (err: any) {
      console.log(`[DEEP-MAP] ${alpacaTF} error: ${err.message}`);
      break;
    }
  } while (pageToken);

  const sorted = all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  console.log(`[DEEP-MAP] ${alpacaTF} DONE: ${sorted.length} candles`);
  return sorted;
}

export interface DeepHistory {
  '15m': OHLCV[];
  '1h': OHLCV[];
  '4h': OHLCV[];
  '1d': OHLCV[];
}

export async function downloadCompleteHistory(asset: string, onProgress?: (msg: string, pct: number) => void): Promise<DeepHistory> {
  const tfs: (keyof DeepHistory)[] = ['15m', '1h', '4h', '1d'];
  const result: any = {};
  let i = 0;
  for (const tf of tfs) {
    onProgress?.(`Downloading ${tf}...`, (i / tfs.length) * 100);
    result[tf] = await downloadTimeframe(asset, tf, 4);
    i++;
  }
  onProgress?.('Download complete', 100);
  return result as DeepHistory;
}
