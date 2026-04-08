// One-shot helper: converte la chiave legacy nexus:analytic:list (STRING JSON Phase 1)
// in un SET Redis (Phase 2). Idempotente.
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { redisGet, redisDel, redisSMembers, redisSAdd } = await import('../../src/lib/db/redis');

  try {
    const members = await redisSMembers('nexus:analytic:list');
    console.log('list già SET, members:', members);
    return;
  } catch {
    console.log('list è STRING legacy — converto…');
  }

  const legacy = await redisGet<string[]>('nexus:analytic:list');
  await redisDel('nexus:analytic:list');
  console.log('STRING legacy rimossa');

  if (Array.isArray(legacy)) {
    for (const s of legacy) {
      // Re-aggiungi solo se lo state esiste ancora
      const exists = await redisGet(`nexus:analytic:${s}`);
      if (exists) await redisSAdd('nexus:analytic:list', s);
    }
    console.log('membri migrati:', legacy);
  }

  const members = await redisSMembers('nexus:analytic:list');
  console.log('membri SET post-migrazione:', members);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
