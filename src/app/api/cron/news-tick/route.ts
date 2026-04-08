// ═══════════════════════════════════════════════════════════════
// Cron route: News tick (Phase 3)
// 1 symbol per chiamata, round-robin via news-cursor.
// Il filtraggio "ogni 30 min" è demandato al cron-worker:
// questa route può essere chiamata in qualsiasi momento.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { fetchNewsForSymbol, nextSymbolForNews } from '@/lib/analytics/news/news-aggregator';
import { redisExists } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KEY_LOCK = 'nexus:analytic:lock';

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start = Date.now();
  if (await redisExists(KEY_LOCK)) {
    return NextResponse.json({ ok: true, skipped: 'training-lock-held', elapsedMs: Date.now() - start });
  }

  const symbol = await nextSymbolForNews();
  if (!symbol) {
    return NextResponse.json({ ok: true, skipped: 'no-symbols', elapsedMs: Date.now() - start });
  }

  try {
    const digest = await fetchNewsForSymbol(symbol);
    return NextResponse.json({
      ok: true,
      symbol,
      count: digest.count,
      avgSentiment: digest.avgSentiment,
      delta: digest.sentimentDelta24h,
      elapsedMs: Date.now() - start,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      symbol,
      error: e?.message ?? String(e),
      elapsedMs: Date.now() - start,
    });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
