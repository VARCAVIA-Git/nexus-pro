// ═══════════════════════════════════════════════════════════════
// Cron route: News tick (Phase 3 → 3.7)
//
// - Senza ?symbol= : round-robin (default), 1 symbol per call.
// - Con ?symbol=BTC%2FUSD : forza fetch del symbol indicato (bypass RR).
//
// Auth duale (Phase 3.7):
//   - x-cron-secret header (PM2 cron-worker)  → sempre accettato
//   - Session cookie nexus-session valida    → accettato (UI refresh button)
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchNewsForSymbol, nextSymbolForNews } from '@/lib/analytics/news/news-aggregator';
import { redisExists, redisGet } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KEY_LOCK = 'nexus:analytic:lock';

async function authorized(req: Request): Promise<boolean> {
  const required = process.env.CRON_SECRET;
  // 1. Cron secret (PM2 worker)
  if (required && req.headers.get('x-cron-secret') === required) return true;
  // 2. Session cookie (UI refresh button)
  const sessionId = cookies().get('nexus-session')?.value;
  if (sessionId) {
    const session = await redisGet(`nexus:session:${sessionId}`);
    if (session) return true;
  }
  // 3. Dev fallback: nessun secret configurato → libero
  if (!required) return true;
  return false;
}

async function handler(req: Request): Promise<Response> {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  if (await redisExists(KEY_LOCK)) {
    return NextResponse.json({ ok: true, skipped: 'training-lock-held', elapsedMs: Date.now() - start });
  }

  // ?symbol=BTC%2FUSD per refresh on-demand
  const url = new URL(req.url);
  const forcedSymbol = url.searchParams.get('symbol') ?? undefined;

  const symbol = forcedSymbol ?? (await nextSymbolForNews());
  if (!symbol) {
    return NextResponse.json({ ok: true, skipped: 'no-symbols', elapsedMs: Date.now() - start });
  }

  try {
    const digest = await fetchNewsForSymbol(symbol);
    return NextResponse.json({
      ok: true,
      symbol,
      newItems: digest.count, // n. di item nel digest corrente
      totalInFeed: digest.topItems?.length ?? 0,
      avgSentiment: digest.avgSentiment,
      delta: digest.sentimentDelta24h,
      forced: Boolean(forcedSymbol),
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

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
