// ═══════════════════════════════════════════════════════════════
// fix/cleanup-zombie · disable-legacy-bots.ts
//
// Aggiunge i bot legacy "BTC AGGRESSIVO" e "BTC TRANQUILLO" alla SET
// Redis `nexus:bot_legacy_disabled`. Il cron tick (Phase 4) li skippa.
//
// Mantiene gli id originali in Redis per readonly nella UI fino a quando
// l'utente non li elimina definitivamente con il delete fixato.
//
// Idempotente: può essere rilanciato senza danni.
//
// Run: npx tsx scripts/migrations/disable-legacy-bots.ts
// ═══════════════════════════════════════════════════════════════

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

// Nomi case-insensitive da disabilitare. Aggiungi qui altri se servisse.
const LEGACY_NAMES = ['btc aggressivo', 'btc tranquillo'];

const DISABLED_SET_KEY = 'nexus:bot_legacy_disabled';

async function main() {
  const { redisGet, redisSAdd, redisSMembers, KEYS } = await import('../../src/lib/db/redis');

  const configs = (await redisGet<any[]>(KEYS.botConfig)) ?? [];
  console.log(`[disable-legacy-bots] loaded ${configs.length} bot config(s) from ${KEYS.botConfig}`);

  if (configs.length === 0) {
    console.log('[disable-legacy-bots] nothing to do (no bots in Redis)');
    return;
  }

  const targets = configs.filter((c) => {
    const name = String(c?.name ?? '').trim().toLowerCase();
    return LEGACY_NAMES.includes(name);
  });

  if (targets.length === 0) {
    console.log(
      `[disable-legacy-bots] no matching bot found. Looked for names: ${LEGACY_NAMES.join(', ')}`,
    );
    console.log('  available bot names:', configs.map((c) => c.name));
    return;
  }

  let added = 0;
  for (const bot of targets) {
    const result = await redisSAdd(DISABLED_SET_KEY, bot.id);
    if (result === 1) {
      console.log(`  ✓ ${bot.name} (${bot.id}) → added to ${DISABLED_SET_KEY}`);
      added++;
    } else {
      console.log(`  · ${bot.name} (${bot.id}) → already disabled`);
    }
  }

  // Verifica finale
  const members = await redisSMembers(DISABLED_SET_KEY);
  console.log(`[disable-legacy-bots] completed. ${added} added, set now contains ${members.length} member(s):`);
  for (const m of members) console.log(`  - ${m}`);
}

main().catch((e) => {
  console.error('[disable-legacy-bots] FATAL:', e);
  process.exit(1);
});
