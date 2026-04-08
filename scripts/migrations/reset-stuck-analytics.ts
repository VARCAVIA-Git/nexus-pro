// ═══════════════════════════════════════════════════════════════
// One-shot migration: ripulisce le AI Analytic bloccate da Phase 1
// Run: pnpm tsx scripts/migrations/reset-stuck-analytics.ts
// ═══════════════════════════════════════════════════════════════

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local before importing redis
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  // Lazy import so the env is loaded first
  const { redisGet, redisDel, redisSMembers, redisSRem, redisLRem, redisExists } =
    await import('../../src/lib/db/redis');

  const STALE_AFTER_MS = 2 * 60 * 60 * 1000; // 2h
  const now = Date.now();

  let symbols: string[] = [];
  // Lista source-of-truth: SET nexus:analytic:list (Phase 2 schema)
  try {
    symbols = await redisSMembers('nexus:analytic:list');
  } catch (e) {
    console.warn('[migration] SMEMBERS fallita, fallback su JSON list:', (e as Error).message);
  }
  // Fallback alla forma legacy Phase 1 (JSON array sotto la stessa chiave)
  if (!symbols || symbols.length === 0) {
    const legacy = await redisGet<string[]>('nexus:analytic:list');
    if (Array.isArray(legacy)) symbols = legacy;
  }

  console.log(`[migration] ${symbols.length} symbol registrati su nexus:analytic:list`);

  let cleaned = 0;
  let kept = 0;

  for (const symbol of symbols) {
    const state = await redisGet<{
      symbol: string;
      status: string;
      createdAt: number;
      lastTrainedAt: number | null;
    }>(`nexus:analytic:${symbol}`);

    if (!state) {
      // Stato corrotto/mancante: pulisci tutte le chiavi residue
      await wipeAll(symbol);
      cleaned++;
      console.log(`  ✓ ${symbol} (stato mancante) ripulito`);
      continue;
    }

    const isStuck =
      (state.status === 'queued' || state.status === 'training') &&
      state.lastTrainedAt === null &&
      now - state.createdAt > STALE_AFTER_MS;

    if (!isStuck) {
      kept++;
      continue;
    }

    await wipeAll(symbol);
    cleaned++;
    console.log(`  ✓ ${symbol} (stuck in '${state.status}') ripulito`);
  }

  // Cleanup queue residual entries: la coda è una LIST in Phase 2
  for (const symbol of symbols) {
    try {
      await redisLRem('nexus:analytic:queue', 0, symbol);
    } catch {
      /* coda potrebbe non esistere o essere in formato legacy */
    }
  }
  // Se la queue è ancora memorizzata come JSON (Phase 1), spazza via
  const legacyQueue = await redisGet<unknown>('nexus:analytic:queue');
  if (legacyQueue && !Array.isArray(legacyQueue)) {
    // niente, è già una LIST
  }
  if (Array.isArray(legacyQueue)) {
    await redisDel('nexus:analytic:queue');
    console.log('  ✓ legacy JSON queue rimossa');
  }
  // Lock residuo
  if (await redisExists('nexus:analytic:lock')) {
    await redisDel('nexus:analytic:lock');
    console.log('  ✓ lock residuo rimosso');
  }

  console.log('');
  console.log(`[migration] Completato. Ripuliti: ${cleaned}, mantenuti: ${kept}`);

  async function wipeAll(symbol: string) {
    await Promise.all([
      redisDel(`nexus:analytic:${symbol}`),
      redisDel(`nexus:analytic:job:${symbol}`),
      redisDel(`nexus:analytic:dataset:${symbol}`),
      redisDel(`nexus:analytic:report:${symbol}`),
      redisDel(`nexus:analytic:live:${symbol}`),
      redisDel(`nexus:analytic:zones:${symbol}`),
    ]);
    try {
      await redisSRem('nexus:analytic:list', symbol);
    } catch {
      /* ignore — verrà gestito sotto se è ancora un JSON array */
    }
    try {
      await redisLRem('nexus:analytic:queue', 0, symbol);
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error('[migration] FATAL:', e);
  process.exit(1);
});
