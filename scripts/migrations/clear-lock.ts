// ═══════════════════════════════════════════════════════════════
// fix/cleanup-zombie · clear-lock.ts
//
// Libera il lock di training (`nexus:analytic:lock`) e resetta a 'ready'
// gli AssetAnalytic stuck in stato 'training' più vecchi di 10 minuti.
//
// Usato dopo il deploy del fix Phase 4. Idempotente.
//
// Run: npx tsx scripts/migrations/clear-lock.ts
// ═══════════════════════════════════════════════════════════════

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { redisGetRaw, redisDel, redisSMembers, redisGet, redisSet } = await import(
    '../../src/lib/db/redis'
  );

  const LOCK_KEY = 'nexus:analytic:lock';

  // 1. Lock release
  const current = await redisGetRaw(LOCK_KEY);
  console.log('[clear-lock] current value:', current ?? '<empty>');
  if (current) {
    await redisDel(LOCK_KEY);
    console.log('[clear-lock] deleted');
  } else {
    console.log('[clear-lock] nothing to delete');
  }

  // 2. Reset eventuali AssetAnalytic stuck in 'training' da > 10 min
  let symbols: string[] = [];
  try {
    symbols = await redisSMembers('nexus:analytic:list');
  } catch {
    symbols = [];
  }
  // Fallback legacy: nexus:analytic:list potrebbe ancora essere JSON STRING
  if (!symbols || symbols.length === 0) {
    const legacy = await redisGet<string[]>('nexus:analytic:list');
    if (Array.isArray(legacy)) symbols = legacy;
  }

  console.log(`[clear-lock] inspecting ${symbols.length} symbol(s) for stuck training`);
  let resetCount = 0;
  for (const sym of symbols) {
    const stateKey = `nexus:analytic:${sym}`;
    const state = await redisGet<any>(stateKey);
    if (!state) continue;
    if (state.status !== 'training' && state.status !== 'refreshing') continue;

    // L'AssetAnalytic state usa `createdAt` (Phase 2) come timestamp di
    // creazione/ultima messa-in-coda. Fallback a `lastTrainedAt` se manca.
    const startedAt: number = state.createdAt ?? state.lastTrainedAt ?? 0;
    const ageMs = Date.now() - startedAt;
    if (ageMs > 10 * 60 * 1000) {
      const previousStatus = state.status;
      // Se era ready prima del refresh, torna ready; altrimenti unassigned
      // (queued senza pipeline attiva == orfano).
      state.status = state.lastTrainedAt ? 'ready' : 'unassigned';
      state.lastError = `force-released stale ${previousStatus} (age ${Math.round(ageMs / 1000)}s)`;
      await redisSet(stateKey, state);
      console.log(
        `[clear-lock] reset ${sym}: ${previousStatus} → ${state.status} (age ${Math.round(ageMs / 1000)}s)`,
      );
      resetCount++;
    }
  }
  console.log(`[clear-lock] completed. Reset ${resetCount} stuck state(s).`);
}

main().catch((e) => {
  console.error('[clear-lock] FATAL:', e);
  process.exit(1);
});
