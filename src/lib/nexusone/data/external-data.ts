/**
 * src/lib/nexusone/data/external-data.ts
 *
 * External data sources for multi-dimensional feature logging.
 * All free, no API keys required. All functions follow the OKX pattern:
 * try-catch, return null on error, log warnings.
 *
 * These are SLOW data sources (minutes to hours). Cached aggressively.
 */

// ============================================================
// In-memory cache (simple TTL, no Redis dependency)
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCache<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ============================================================
// Fear & Greed Index (Alternative.me)
// Updates: ~2x daily. Cache: 15 minutes.
// ============================================================

export interface FearGreedData {
  value: number;          // 0-100
  classification: string; // 'Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'
  timestamp: number;      // epoch seconds
}

const FG_CACHE_KEY = 'fear_greed';
const FG_CACHE_TTL = 15 * 60 * 1000; // 15 min

export async function fetchFearGreedIndex(): Promise<FearGreedData | null> {
  const cached = getCached<FearGreedData>(FG_CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      cache: 'no-store' as RequestCache,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[external/fear-greed] HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    if (!json.data?.length) {
      console.warn('[external/fear-greed] empty response');
      return null;
    }

    const entry = json.data[0];
    const result: FearGreedData = {
      value: parseInt(entry.value, 10),
      classification: entry.value_classification,
      timestamp: parseInt(entry.timestamp, 10),
    };

    setCache(FG_CACHE_KEY, result, FG_CACHE_TTL);
    return result;
  } catch (err) {
    console.error('[external/fear-greed] fetch failed:', err);
    return null;
  }
}

// ============================================================
// BTC Dominance (CoinGecko /global)
// Rate limit: 10-30 req/min (shared). Cache: 10 minutes.
// ============================================================

const DOM_CACHE_KEY = 'btc_dominance';
const DOM_CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function fetchBtcDominance(): Promise<number | null> {
  const cached = getCached<number>(DOM_CACHE_KEY);
  if (cached !== null) return cached;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      cache: 'no-store' as RequestCache,
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.warn(`[external/coingecko] HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const dominance = json.data?.market_cap_percentage?.btc;

    if (typeof dominance !== 'number') {
      console.warn('[external/coingecko] btc dominance not found in response');
      return null;
    }

    setCache(DOM_CACHE_KEY, dominance, DOM_CACHE_TTL);
    return dominance;
  } catch (err) {
    console.error('[external/coingecko] fetch failed:', err);
    return null;
  }
}
