// ═══════════════════════════════════════════════════════════════
// Analytic Registry — singleton per gestire tutte le AI Analytic
// Phase 1: persistenza Redis con stato fittizio (no training reale)
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet, redisDel } from '@/lib/db/redis';
import type { AssetAnalytic as AssetAnalyticState, AssetClass } from './types';
import { AssetAnalytic } from './asset-analytic';

const KEY_STATE = (symbol: string) => `nexus:analytic:${symbol}`;
const KEY_LIST = 'nexus:analytic:list';

async function loadList(): Promise<string[]> {
  const list = await redisGet<string[]>(KEY_LIST);
  return Array.isArray(list) ? list : [];
}

async function saveList(symbols: string[]): Promise<void> {
  await redisSet(KEY_LIST, Array.from(new Set(symbols)));
}

/** Restituisce lo stato di un'AI Analytic, o null se non esiste. */
export async function getAnalytic(symbol: string): Promise<AssetAnalyticState | null> {
  return redisGet<AssetAnalyticState>(KEY_STATE(symbol));
}

/** Lista tutte le AI Analytic registrate. */
export async function listAnalytics(): Promise<AssetAnalyticState[]> {
  const symbols = await loadList();
  if (symbols.length === 0) return [];
  const states = await Promise.all(symbols.map((s) => getAnalytic(s)));
  return states.filter((s): s is AssetAnalyticState => s !== null);
}

/** Crea una nuova AI Analytic per il symbol indicato. Idempotente. */
export async function spawnAnalytic(symbol: string, assetClass: AssetClass): Promise<AssetAnalyticState> {
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
  const list = await loadList();
  list.push(symbol);
  await saveList(list);
  return state;
}

/** Rimuove un'AI Analytic. In Phase 2 verificherà che nessuna Strategy la usi. */
export async function removeAnalytic(symbol: string): Promise<void> {
  await redisDel(KEY_STATE(symbol));
  const list = await loadList();
  await saveList(list.filter((s) => s !== symbol));
}

/** Persist a state update (utility interna usata anche dalla queue). */
export async function saveAnalyticState(state: AssetAnalyticState): Promise<void> {
  await redisSet(KEY_STATE(state.symbol), state);
}

/** Costruisce un'istanza AssetAnalytic (stub Phase 1). */
export function buildAnalytic(state: AssetAnalyticState): AssetAnalytic {
  return new AssetAnalytic(state.symbol, state.assetClass);
}
