// ═══════════════════════════════════════════════════════════════
// R&D Data Warehouse — downloads and caches historical OHLCV data
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import type { TFKey } from '@/types/intelligence';
import { redisGet, redisSet, KEYS } from '@/lib/db/redis';
import { fetchMTFCandles } from '../mtf-data';

export const RESEARCH_ASSETS = {
  crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'LINK/USD'],
  stocks: ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'MSFT', 'META'],
};

export const ALL_ASSETS = [...RESEARCH_ASSETS.crypto, ...RESEARCH_ASSETS.stocks];
export const RESEARCH_TFS: TFKey[] = ['1d', '4h', '1h']; // Focus on most useful TFs for research

export interface WarehouseData {
  asset: string;
  timeframe: string;
  candles: OHLCV[];
  totalCandles: number;
  lastUpdated: string;
}

export interface WarehouseStatus {
  assetsLoaded: number;
  totalAssets: number;
  items: Array<{ asset: string; timeframe: string; candles: number; lastUpdated: string }>;
  inProgress: boolean;
  currentAsset?: string;
  error?: string;
}

// Global progress tracking
const G = globalThis as any;
if (!G.__rndWarehouseStatus) G.__rndWarehouseStatus = { assetsLoaded: 0, totalAssets: 0, items: [], inProgress: false } as WarehouseStatus;

export function getWarehouseStatus(): WarehouseStatus {
  return G.__rndWarehouseStatus;
}

/** Load cached warehouse data for an asset+timeframe */
export async function loadWarehouse(asset: string, tf: string): Promise<OHLCV[]> {
  const key = KEYS.warehouse(asset, tf);
  try {
    const data = await redisGet<WarehouseData>(key);
    if (data?.candles?.length) return data.candles;
  } catch {}
  return [];
}

/** Download data for one asset+timeframe and cache in Redis */
async function downloadAndCache(asset: string, tf: TFKey): Promise<number> {
  const candles = await fetchMTFCandles(asset, tf);
  if (candles.length > 20) {
    const data: WarehouseData = {
      asset, timeframe: tf, candles,
      totalCandles: candles.length,
      lastUpdated: new Date().toISOString(),
    };
    await redisSet(KEYS.warehouse(asset, tf), data, 604800); // 7 days TTL
  }
  return candles.length;
}

/** Populate the entire warehouse — call with rate limiting */
export async function populateWarehouse(onProgress?: (msg: string) => void): Promise<WarehouseStatus> {
  const status = G.__rndWarehouseStatus as WarehouseStatus;
  if (status.inProgress) return status;

  status.inProgress = true;
  status.items = [];
  status.assetsLoaded = 0;
  status.totalAssets = ALL_ASSETS.length * RESEARCH_TFS.length;
  status.error = undefined;

  try {
    for (const asset of ALL_ASSETS) {
      for (const tf of RESEARCH_TFS) {
        status.currentAsset = `${asset} ${tf}`;
        onProgress?.(`Downloading ${asset} ${tf}...`);

        try {
          const count = await downloadAndCache(asset, tf);
          status.items.push({ asset, timeframe: tf, candles: count, lastUpdated: new Date().toISOString() });
          status.assetsLoaded++;
          console.log(`  📦 ${asset} ${tf}: ${count} candles`);
        } catch (err: any) {
          console.error(`  ❌ ${asset} ${tf}: ${err.message}`);
          status.items.push({ asset, timeframe: tf, candles: 0, lastUpdated: '' });
        }

        // Rate limit pause between requests
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  } catch (err: any) {
    status.error = err.message;
  }

  status.inProgress = false;
  status.currentAsset = undefined;

  // Persist status
  redisSet(KEYS.warehouseStatus, status, 86400).catch(() => {});
  return status;
}
