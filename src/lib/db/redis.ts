// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Upstash Redis Persistence Layer
// Stores: notifications, trades, signals, bot config
// ═══════════════════════════════════════════════════════════════

const getUrl = () => process.env.UPSTASH_REDIS_REST_URL ?? '';
const getToken = () => process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

async function redis<T = any>(cmd: string[]): Promise<T> {
  const url = getUrl();
  const token = getToken();
  if (!url || !token) throw new Error('Upstash Redis not configured');

  const res = await fetch(`${url}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });

  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  const data = await res.json();
  return data.result;
}

// ── Generic helpers ───────────────────────────────────────

export async function redisSet(key: string, value: unknown, exSeconds?: number): Promise<void> {
  const json = JSON.stringify(value);
  if (exSeconds) {
    await redis(['SET', key, json, 'EX', String(exSeconds)]);
  } else {
    await redis(['SET', key, json]);
  }
}

export async function redisGet<T = any>(key: string): Promise<T | null> {
  const raw = await redis<string | null>(['GET', key]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function redisDel(key: string): Promise<void> {
  await redis(['DEL', key]);
}

/** Push to a capped list (newest first) */
export async function redisLpush(key: string, value: unknown, maxLen = 500): Promise<void> {
  const json = JSON.stringify(value);
  await redis(['LPUSH', key, json]);
  await redis(['LTRIM', key, '0', String(maxLen - 1)]);
}

/** Get range from list */
export async function redisLrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
  const raw = await redis<string[]>(['LRANGE', key, String(start), String(stop)]);
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

/** Get list length */
export async function redisLlen(key: string): Promise<number> {
  return await redis<number>(['LLEN', key]) ?? 0;
}

// ── Raw LIST helpers (Phase 2: store plain string members like symbols) ──

/** LPUSH a single raw string. Returns new list length. */
export async function redisLPush(key: string, value: string): Promise<number> {
  return (await redis<number>(['LPUSH', key, value])) ?? 0;
}

/** RPOP a single raw string member, or null if empty. */
export async function redisRPop(key: string): Promise<string | null> {
  return (await redis<string | null>(['RPOP', key])) ?? null;
}

/** LRANGE returning raw string members (no JSON parse). */
export async function redisLRange(key: string, start: number, stop: number): Promise<string[]> {
  const raw = await redis<string[]>(['LRANGE', key, String(start), String(stop)]);
  return Array.isArray(raw) ? raw : [];
}

/** LLEN of a list. */
export async function redisLLen(key: string): Promise<number> {
  return (await redis<number>(['LLEN', key])) ?? 0;
}

/** LREM count occurrences of value from list. */
export async function redisLRem(key: string, count: number, value: string): Promise<number> {
  return (await redis<number>(['LREM', key, String(count), value])) ?? 0;
}

// ── SET helpers ───────────────────────────────────────────

export async function redisSAdd(key: string, member: string): Promise<number> {
  return (await redis<number>(['SADD', key, member])) ?? 0;
}

export async function redisSRem(key: string, member: string): Promise<number> {
  return (await redis<number>(['SREM', key, member])) ?? 0;
}

export async function redisSMembers(key: string): Promise<string[]> {
  const raw = await redis<string[]>(['SMEMBERS', key]);
  return Array.isArray(raw) ? raw : [];
}

export async function redisSIsMember(key: string, member: string): Promise<boolean> {
  const raw = await redis<number>(['SISMEMBER', key, member]);
  return raw === 1;
}

// ── Misc primitives ───────────────────────────────────────

export async function redisExists(key: string): Promise<boolean> {
  const raw = await redis<number>(['EXISTS', key]);
  return raw === 1;
}

export async function redisExpire(key: string, seconds: number): Promise<number> {
  return (await redis<number>(['EXPIRE', key, String(seconds)])) ?? 0;
}

export async function redisIncr(key: string): Promise<number> {
  return (await redis<number>(['INCR', key])) ?? 0;
}

/**
 * SET with NX (only if not exists) + EX (TTL seconds).
 * Returns true if the lock was acquired, false if a value already exists.
 */
export async function redisSetNX(key: string, value: string, exSeconds: number): Promise<boolean> {
  const result = await redis<string | null>(['SET', key, value, 'NX', 'EX', String(exSeconds)]);
  return result === 'OK';
}

/** Raw GET (no JSON parse). */
export async function redisGetRaw(key: string): Promise<string | null> {
  return (await redis<string | null>(['GET', key])) ?? null;
}

/** Raw SET (no JSON encode), with optional TTL. */
export async function redisSetRaw(key: string, value: string, exSeconds?: number): Promise<void> {
  if (exSeconds) {
    await redis(['SET', key, value, 'EX', String(exSeconds)]);
  } else {
    await redis(['SET', key, value]);
  }
}

/** Check connection */
export async function redisPing(): Promise<boolean> {
  try {
    const result = await redis<string>(['PING']);
    return result === 'PONG';
  } catch { return false; }
}

// ── Domain Keys ───────────────────────────────────────────

export const KEYS = {
  notifications: 'nexus:notifications',
  notifUnread: 'nexus:notif_unread_count',
  trades: 'nexus:trades',
  signals: 'nexus:signal_log',
  botConfig: 'nexus:bot_config',
  botState: 'nexus:bot_state',
  performance: 'nexus:performance',
  // Learning engine
  learningOutcomes: 'nexus:learning:outcomes',
  learningInsights: (asset: string) => `nexus:learning:insights:${asset}`,
  learningWeights: (asset: string) => `nexus:learning:weights:${asset}`,
  // R&D Lab
  warehouse: (asset: string, tf: string) => `nexus:warehouse:${asset}:${tf}`,
  warehouseStatus: 'nexus:rnd:warehouse_status',
  scanResults: (asset: string, tf: string) => `nexus:rnd:scan:${asset}:${tf}`,
  scanStatus: 'nexus:rnd:scan_status',
  patternMap: (asset: string) => `nexus:rnd:patterns:${asset}`,
  eventReactions: (asset: string) => `nexus:rnd:events:${asset}`,
  labResults: (asset: string) => `nexus:rnd:lab:${asset}`,
  knowledge: 'nexus:rnd:knowledge',
};
