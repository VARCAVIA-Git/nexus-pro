// ═══════════════════════════════════════════════════════════════
// Analytic Observation Loop — chiamato dal cron worker (Phase 2)
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSMembers } from '@/lib/db/redis';
import type { AssetAnalytic as AssetAnalyticState } from './types';
import { AssetAnalytic } from './asset-analytic';
import { processNext } from './analytic-queue';

const KEY_LIST = 'nexus:analytic:list';
const KEY_STATE = (s: string) => `nexus:analytic:${s}`;

const TICK_BUDGET_MS = 30_000; // 30s totali per il loop
const PER_ASSET_BUDGET_MS = 2_000; // cap per asset (stretto)

/**
 * Esegue un tick di osservazione live su tutte le AI Analytic 'ready'.
 * Ritorna il numero di asset osservati con successo.
 */
export async function tickObservationLoop(): Promise<number> {
  const start = Date.now();
  let symbols: string[] = [];
  try {
    symbols = await redisSMembers(KEY_LIST);
  } catch {
    symbols = [];
  }
  if (!Array.isArray(symbols) || symbols.length === 0) return 0;

  let observed = 0;
  for (const symbol of symbols) {
    if (Date.now() - start > TICK_BUDGET_MS) {
      console.warn('[analytic-loop] tick budget exceeded, skipping remaining');
      break;
    }
    try {
      const state = await redisGet<AssetAnalyticState>(KEY_STATE(symbol));
      if (!state || state.status !== 'ready') continue;

      const analytic = new AssetAnalytic(symbol, state.assetClass);
      await Promise.race([
        analytic.observeLive(),
        new Promise((res) => setTimeout(res, PER_ASSET_BUDGET_MS)),
      ]);
      observed++;
    } catch (e) {
      console.warn(`[analytic-loop] ${symbol}:`, (e as Error).message);
    }
  }

  return observed;
}

/**
 * Tenta di processare il prossimo job dalla queue.
 * Single-shot per tick — il training pesante richiede minuti, va eseguito
 * fuori dal tick e proseguirà al prossimo round se non ha finito (lock).
 */
export async function tickQueueWorker(): Promise<boolean> {
  try {
    return await processNext();
  } catch (e) {
    console.warn('[analytic-loop] queue worker error:', (e as Error).message);
    return false;
  }
}
