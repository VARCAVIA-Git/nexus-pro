// ═══════════════════════════════════════════════════════════════
// Alpaca Keys Helper — reads keys from env or Redis
// ═══════════════════════════════════════════════════════════════

import { redisGet } from '@/lib/db/redis';
import { decrypt } from '@/lib/utils/encryption';

export interface AlpacaKeys {
  key: string;
  secret: string;
  baseUrl: string;
  mode: 'live' | 'paper';
}

/**
 * Get the best available Alpaca keys.
 * Priority: env live → Redis live → env paper
 */
export async function getAlpacaKeys(): Promise<AlpacaKeys | null> {
  // 1. Try env live keys
  const envLiveKey = process.env.ALPACA_LIVE_API_KEY;
  const envLiveSecret = process.env.ALPACA_LIVE_SECRET_KEY;
  if (envLiveKey && envLiveSecret) {
    return { key: envLiveKey, secret: envLiveSecret, baseUrl: 'https://api.alpaca.markets', mode: 'live' };
  }

  // 2. Try Redis-saved keys
  try {
    const saved = await redisGet<Record<string, any>>('nexus:broker:keys');
    if (saved?.liveKey && saved?.liveSecret && saved?.liveEnabled) {
      return {
        key: decrypt(String(saved.liveKey)),
        secret: decrypt(String(saved.liveSecret)),
        baseUrl: 'https://api.alpaca.markets',
        mode: 'live',
      };
    }
  } catch {}

  // 3. Fallback to paper
  const paperKey = process.env.ALPACA_API_KEY;
  const paperSecret = process.env.ALPACA_API_SECRET;
  if (paperKey && paperSecret) {
    return { key: paperKey, secret: paperSecret, baseUrl: 'https://paper-api.alpaca.markets', mode: 'paper' };
  }

  return null;
}

/** Make an authenticated Alpaca API call */
export async function alpacaFetch<T = any>(path: string, keys?: AlpacaKeys | null): Promise<T | null> {
  const k = keys ?? await getAlpacaKeys();
  if (!k) return null;

  try {
    const res = await fetch(`${k.baseUrl}${path}`, {
      headers: { 'APCA-API-KEY-ID': k.key, 'APCA-API-SECRET-KEY': k.secret },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
