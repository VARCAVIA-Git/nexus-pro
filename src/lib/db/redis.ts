// ═══════════════════════════════════════════════════════════════
// NexusOne — Redis Client (Dual Mode)
//
// Supports:
//   1. Local Redis (ioredis) — when REDIS_URL is set
//   2. Upstash REST — when only UPSTASH_REDIS_REST_URL is set
//
// Local Redis is preferred (zero cost, zero latency, no limits).
// ═══════════════════════════════════════════════════════════════

import Redis from 'ioredis';

// ─── Connection ──────────────────────────────────────────────

let _local: Redis | null = null;

function getLocal(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!_local) {
    _local = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      lazyConnect: true,
    });
    _local.on('error', (err) => console.warn('[redis] error:', err.message));
  }
  return _local;
}

// ─── Upstash REST fallback ───────────────────────────────────

async function upstash<T = any>(cmd: string[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  if (!url || !token) throw new Error('Redis not configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    return (await res.json()).result;
  } catch (err) { clearTimeout(timer); throw err; }
}

// ─── Unified dispatcher ─────────────────────────────────────

async function redis<T = any>(cmd: string[]): Promise<T> {
  const local = getLocal();
  if (local) {
    const result = await (local as any).call(...cmd);
    return result as T;
  }
  return upstash<T>(cmd);
}

// ─── Public API ──────────────────────────────────────────────

export async function redisSet(key: string, value: unknown, exSeconds?: number): Promise<void> {
  const json = JSON.stringify(value);
  if (exSeconds) await redis(['SET', key, json, 'EX', String(exSeconds)]);
  else await redis(['SET', key, json]);
}

export async function redisGet<T = any>(key: string): Promise<T | null> {
  const raw = await redis<string | object | null>(['GET', key]);
  if (!raw) return null;
  if (typeof raw === 'object') return raw as T;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function redisDel(key: string): Promise<void> { await redis(['DEL', key]); }

export async function redisLpush(key: string, value: unknown, maxLen = 500): Promise<void> {
  await redis(['LPUSH', key, JSON.stringify(value)]);
  await redis(['LTRIM', key, '0', String(maxLen - 1)]);
}

export async function redisLrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
  const raw = await redis<string[]>(['LRANGE', key, String(start), String(stop)]);
  if (!Array.isArray(raw)) return [];
  return raw.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

export async function redisLlen(key: string): Promise<number> {
  const n = await redis<number | string>(['LLEN', key]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisLPush(key: string, value: string): Promise<number> {
  const n = await redis<number | string>(['LPUSH', key, value]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisRPop(key: string): Promise<string | null> {
  return (await redis<string | null>(['RPOP', key])) ?? null;
}

export async function redisLRange(key: string, start: number, stop: number): Promise<string[]> {
  const raw = await redis<string[]>(['LRANGE', key, String(start), String(stop)]);
  return Array.isArray(raw) ? raw : [];
}

export async function redisLLen(key: string): Promise<number> {
  const n = await redis<number | string>(['LLEN', key]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisLRem(key: string, count: number, value: string): Promise<number> {
  const n = await redis<number | string>(['LREM', key, String(count), value]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisSAdd(key: string, member: string): Promise<number> {
  const n = await redis<number | string>(['SADD', key, member]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisSRem(key: string, member: string): Promise<number> {
  const n = await redis<number | string>(['SREM', key, member]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisSMembers(key: string): Promise<string[]> {
  const raw = await redis<string[]>(['SMEMBERS', key]);
  return Array.isArray(raw) ? raw : [];
}

export async function redisSIsMember(key: string, member: string): Promise<boolean> {
  const raw = await redis<number | string>(['SISMEMBER', key, member]);
  return raw === 1 || raw === '1';
}

export async function redisExists(key: string): Promise<boolean> {
  const raw = await redis<number | string>(['EXISTS', key]);
  return raw === 1 || raw === '1';
}

export async function redisExpire(key: string, seconds: number): Promise<number> {
  const n = await redis<number | string>(['EXPIRE', key, String(seconds)]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisIncr(key: string): Promise<number> {
  const n = await redis<number | string>(['INCR', key]);
  return typeof n === 'number' ? n : parseInt(String(n)) || 0;
}

export async function redisSetNX(key: string, value: string, exSeconds: number): Promise<boolean> {
  const result = await redis<string | null>(['SET', key, value, 'NX', 'EX', String(exSeconds)]);
  return result === 'OK';
}

export async function redisGetRaw(key: string): Promise<string | null> {
  return (await redis<string | null>(['GET', key])) ?? null;
}

export async function redisSetRaw(key: string, value: string, exSeconds?: number): Promise<void> {
  if (exSeconds) await redis(['SET', key, value, 'EX', String(exSeconds)]);
  else await redis(['SET', key, value]);
}

export async function redisPing(): Promise<boolean> {
  try { return (await redis<string>(['PING'])) === 'PONG'; } catch { return false; }
}

export const KEYS = {
  notifications: 'nexus:notifications',
  notifUnread: 'nexus:notif_unread_count',
  trades: 'nexus:trades',
  signals: 'nexus:signal_log',
  botConfig: 'nexus:bot_config',
  botState: 'nexus:bot_state',
  performance: 'nexus:performance',
  learningOutcomes: 'nexus:learning:outcomes',
  learningInsights: (asset: string) => `nexus:learning:insights:${asset}`,
  learningWeights: (asset: string) => `nexus:learning:weights:${asset}`,
  warehouse: (asset: string, tf: string) => `nexus:warehouse:${asset}:${tf}`,
  warehouseStatus: 'nexus:rnd:warehouse_status',
  scanResults: (asset: string, tf: string) => `nexus:rnd:scan:${asset}:${tf}`,
  scanStatus: 'nexus:rnd:scan_status',
  patternMap: (asset: string) => `nexus:rnd:patterns:${asset}`,
  eventReactions: (asset: string) => `nexus:rnd:events:${asset}`,
  labResults: (asset: string) => `nexus:rnd:lab:${asset}`,
  knowledge: 'nexus:rnd:knowledge',
};
