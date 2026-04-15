// ═══════════════════════════════════════════════════════════════
// Cron route: Live Observer tick (Phase 3)
// Round-robin: 1 symbol per tick. Skip se queue worker sta
// processando un full retrain (lock presente).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import {
  redisGet,
  redisSet,
  redisSMembers,
  redisExists,
} from '@/lib/db/redis';
import type { AssetAnalytic } from '@/lib/analytics/types';
import { computeLiveContext } from '@/lib/analytics/live-observer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const KEY_LIST = 'nexus:analytic:list';
const KEY_LOCK = 'nexus:analytic:lock';
const KEY_CURSOR = 'nexus:analytic:live-cursor';
const KEY_STATE = (s: string) => `nexus:analytic:${s}`;

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

/** Process ALL ready symbols on each tick, not round-robin. */
async function getAllReadySymbols(): Promise<string[]> {
  const members = await redisSMembers(KEY_LIST);
  if (!members || members.length === 0) return [];
  const ready: string[] = [];
  for (const sym of members) {
    const state = await redisGet<AssetAnalytic>(KEY_STATE(sym));
    if (state?.status === 'ready') ready.push(sym);
  }
  return ready;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start = Date.now();

  // Skip se è in corso un training pesante
  if (await redisExists(KEY_LOCK)) {
    return NextResponse.json({ ok: true, skipped: 'training-lock-held', elapsedMs: Date.now() - start });
  }

  const symbols = await getAllReadySymbols();
  if (symbols.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no-symbols', elapsedMs: Date.now() - start });
  }

  // Process all symbols in parallel with budget guard
  const BUDGET_MS = 25_000;
  const results = await Promise.allSettled(
    symbols.map(async sym => {
      if (Date.now() - start > BUDGET_MS) return { symbol: sym, skipped: 'budget' };
      try {
        const ctx = await computeLiveContext(sym);
        return {
          symbol: sym,
          regime: ctx.regime,
          momentumScore: ctx.momentumScore,
          activeRules: ctx.activeRules.length,
        };
      } catch (e: any) {
        return { symbol: sym, error: e?.message ?? String(e), code: e?.code };
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    processed: symbols.length,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    elapsedMs: Date.now() - start,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
