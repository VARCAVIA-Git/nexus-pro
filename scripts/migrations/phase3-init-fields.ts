// One-shot migration: per ogni AI Analytic ready, inizializza i nuovi
// campi Phase 3 a null/0 (lastIncrementalTrainAt, lastLiveContextAt,
// lastNewsFetchAt, currentRegime, regimeChangedAt) senza toccare il report.
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { redisGet, redisSet, redisSMembers, redisDel } = await import('../../src/lib/db/redis');

  let symbols: string[] = [];
  try {
    symbols = await redisSMembers('nexus:analytic:list');
  } catch {
    symbols = [];
  }
  if (!symbols.length) {
    const legacy = await redisGet<string[]>('nexus:analytic:list');
    if (Array.isArray(legacy)) symbols = legacy;
  }

  console.log(`[phase3-init] ${symbols.length} symbol da migrare`);
  let touched = 0;
  for (const symbol of symbols) {
    const state = await redisGet<any>(`nexus:analytic:${symbol}`);
    if (!state) continue;
    let changed = false;
    if (!('lastIncrementalTrainAt' in state)) {
      state.lastIncrementalTrainAt = null;
      changed = true;
    }
    if (!('lastLiveContextAt' in state)) {
      state.lastLiveContextAt = null;
      changed = true;
    }
    if (!('lastNewsFetchAt' in state)) {
      state.lastNewsFetchAt = null;
      changed = true;
    }
    if (!('currentRegime' in state)) {
      state.currentRegime = null;
      changed = true;
    }
    if (!('regimeChangedAt' in state)) {
      state.regimeChangedAt = null;
      changed = true;
    }
    if (changed) {
      await redisSet(`nexus:analytic:${symbol}`, state);
      console.log(`  ✓ ${symbol}`);
      touched++;
    } else {
      console.log(`  · ${symbol} già aggiornato`);
    }
    // Cleanup legacy live buffer Phase 2 (array di snapshot)
    // La nuova versione scrive un singolo LiveContext object al prossimo tick.
    const live = await redisGet<unknown>(`nexus:analytic:live:${symbol}`);
    if (Array.isArray(live)) {
      await redisDel(`nexus:analytic:live:${symbol}`);
      console.log(`    ↳ live buffer legacy rimosso`);
    }
  }
  console.log(`[phase3-init] completato. ${touched}/${symbols.length} aggiornati.`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
