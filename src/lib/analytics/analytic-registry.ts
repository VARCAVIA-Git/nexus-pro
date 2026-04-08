// ═══════════════════════════════════════════════════════════════
// Analytic Registry — singleton CRUD per le AI Analytic (Phase 2)
// La persistenza usa: SET nexus:analytic:list + JSON nexus:analytic:{symbol}
// ═══════════════════════════════════════════════════════════════

import {
  redisGet,
  redisSet,
  redisDel,
  redisSAdd,
  redisSRem,
  redisSMembers,
  redisLRem,
} from '@/lib/db/redis';
import type { AssetAnalytic as AssetAnalyticState, AssetClass } from './types';
import { AssetAnalytic } from './asset-analytic';

const KEY_STATE = (s: string) => `nexus:analytic:${s}`;
const KEY_LIST = 'nexus:analytic:list';
const KEY_QUEUE = 'nexus:analytic:queue';
const KEY_JOB = (s: string) => `nexus:analytic:job:${s}`;
const KEY_DATASET = (s: string) => `nexus:analytic:dataset:${s}`;
const KEY_REPORT = (s: string) => `nexus:analytic:report:${s}`;
const KEY_LIVE = (s: string) => `nexus:analytic:live:${s}`;
const KEY_ZONES = (s: string) => `nexus:analytic:zones:${s}`;

/** Restituisce lo stato di un'AI Analytic, o null se non esiste. */
export async function getAnalytic(symbol: string): Promise<AssetAnalyticState | null> {
  return redisGet<AssetAnalyticState>(KEY_STATE(symbol));
}

/** Lista tutte le AI Analytic registrate. */
export async function listAnalytics(): Promise<AssetAnalyticState[]> {
  let symbols: string[] = [];
  try {
    symbols = await redisSMembers(KEY_LIST);
  } catch {
    symbols = [];
  }
  // Backward compat con il formato legacy Phase 1 (JSON array sotto la stessa chiave)
  if (!symbols || symbols.length === 0) {
    const legacy = await redisGet<string[]>(KEY_LIST);
    if (Array.isArray(legacy)) symbols = legacy;
  }
  if (symbols.length === 0) return [];
  const states = await Promise.all(symbols.map((s) => getAnalytic(s)));
  return states.filter((s): s is AssetAnalyticState => s !== null);
}

/** Crea una nuova AI Analytic per il symbol indicato. Idempotente. */
export async function spawnAnalytic(
  symbol: string,
  assetClass: AssetClass,
): Promise<AssetAnalyticState> {
  const existing = await getAnalytic(symbol);
  if (existing) return existing;

  const now = Date.now();
  const state: AssetAnalyticState = {
    symbol,
    assetClass,
    status: 'unassigned',
    createdAt: now,
    lastTrainedAt: null,
    lastObservedAt: null,
    nextScheduledRefresh: null,
    trainingJobId: null,
    failureCount: 0,
    reportVersion: 0,
  };

  await redisSet(KEY_STATE(symbol), state);
  await redisSAdd(KEY_LIST, symbol);
  return state;
}

/** Rimuove un'AI Analytic e tutte le sue chiavi associate. */
export async function removeAnalytic(symbol: string): Promise<void> {
  await Promise.all([
    redisDel(KEY_STATE(symbol)),
    redisDel(KEY_JOB(symbol)),
    redisDel(KEY_DATASET(symbol)),
    redisDel(KEY_REPORT(symbol)),
    redisDel(KEY_LIVE(symbol)),
    redisDel(KEY_ZONES(symbol)),
  ]);
  await redisSRem(KEY_LIST, symbol).catch(() => {});
  await redisLRem(KEY_QUEUE, 0, symbol).catch(() => {});
}

/** Persist a state update (utility interna usata anche dalla queue). */
export async function saveAnalyticState(state: AssetAnalyticState): Promise<void> {
  await redisSet(KEY_STATE(state.symbol), state);
}

/** Costruisce un'istanza AssetAnalytic dallo state. */
export function buildAnalytic(state: AssetAnalyticState): AssetAnalytic {
  return new AssetAnalytic(state.symbol, state.assetClass);
}
