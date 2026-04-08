// Smoke test Phase 3:
// - Per BTC/USD ed ETH/USD chiama computeLiveContext
// - Stampa il LiveContext JSON risultante
// - Verifica che activeRules abbia almeno 0 (non blocca se 0, solo log)
// - Tenta anche fetchNewsForSymbol per BTC/USD
//
// Uso: npx tsx scripts/migrations/smoke-phase3.ts
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const symbols = ['BTC/USD', 'ETH/USD'];
  const { computeLiveContext } = await import('../../src/lib/analytics/live-observer');
  const { fetchNewsForSymbol } = await import('../../src/lib/analytics/news/news-aggregator');
  const { fetchMacroCalendar, getUpcomingEvents } = await import('../../src/lib/analytics/macro/event-calendar');

  for (const symbol of symbols) {
    console.log('═'.repeat(60));
    console.log(`SMOKE: ${symbol}`);
    console.log('═'.repeat(60));
    try {
      const start = Date.now();
      const ctx = await computeLiveContext(symbol);
      console.log(`computeLiveContext OK in ${Date.now() - start}ms`);
      console.log(JSON.stringify(ctx, null, 2));
      console.log(`activeRules: ${ctx.activeRules.length}`);
      console.log(`nearestZones: ${ctx.nearestZones.length}`);
      console.log(`regime: ${ctx.regime}`);
      console.log(`momentum: ${ctx.momentumScore}`);
    } catch (e: any) {
      console.error(`computeLiveContext FAILED: ${e?.code ?? ''} ${e?.message ?? e}`);
    }
  }

  console.log('═'.repeat(60));
  console.log('SMOKE: news per BTC/USD');
  console.log('═'.repeat(60));
  try {
    const digest = await fetchNewsForSymbol('BTC/USD');
    console.log(`news count: ${digest.count}`);
    console.log(`avg sentiment: ${digest.avgSentiment}`);
    console.log(`top items: ${digest.topItems.length}`);
    if (digest.topItems[0]) {
      console.log('sample:', JSON.stringify(digest.topItems[0], null, 2));
    }
  } catch (e: any) {
    console.error(`news FAILED: ${e?.message}`);
  }

  console.log('═'.repeat(60));
  console.log('SMOKE: macro calendar (ForexFactory)');
  console.log('═'.repeat(60));
  try {
    const all = await fetchMacroCalendar();
    console.log(`calendar events: ${all.length}`);
    const upcoming = await getUpcomingEvents(7 * 24);
    console.log(`high-impact next 7d: ${upcoming.length}`);
    upcoming.slice(0, 5).forEach((e) => {
      console.log(`  - ${new Date(e.scheduledAt).toISOString()} ${e.country} ${e.name}`);
    });
  } catch (e: any) {
    console.error(`macro FAILED: ${e?.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
