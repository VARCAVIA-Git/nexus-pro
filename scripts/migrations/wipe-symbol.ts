// Wipe esplicito di tutte le chiavi associate a un symbol.
// Uso: pnpm exec tsx scripts/migrations/wipe-symbol.ts BTC/USD
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const symbol = process.argv[2];
  if (!symbol) {
    console.error('Uso: tsx scripts/migrations/wipe-symbol.ts <SYMBOL>');
    process.exit(1);
  }
  const { redisDel, redisSRem, redisLRem } = await import('../../src/lib/db/redis');
  await Promise.all([
    redisDel(`nexus:analytic:${symbol}`),
    redisDel(`nexus:analytic:job:${symbol}`),
    redisDel(`nexus:analytic:dataset:${symbol}`),
    redisDel(`nexus:analytic:report:${symbol}`),
    redisDel(`nexus:analytic:live:${symbol}`),
    redisDel(`nexus:analytic:zones:${symbol}`),
  ]);
  await redisSRem('nexus:analytic:list', symbol).catch(() => {});
  await redisLRem('nexus:analytic:queue', 0, symbol).catch(() => {});
  await redisDel('nexus:analytic:lock').catch(() => {});
  console.log(`Wiped ${symbol}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
