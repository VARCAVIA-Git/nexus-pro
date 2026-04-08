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

async function nextSymbolRoundRobin(): Promise<string | null> {
  const members = await redisSMembers(KEY_LIST);
  if (!members || members.length === 0) return null;
  const sorted = [...members].sort();
  const cursor = await redisGet<{ idx: number }>(KEY_CURSOR);
  const idx = cursor?.idx ?? 0;
  const symbol = sorted[idx % sorted.length];
  await redisSet(KEY_CURSOR, { idx: (idx + 1) % sorted.length });
  return symbol;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start = Date.now();

  // Skip se è in corso un training pesante
  if (await redisExists(KEY_LOCK)) {
    return NextResponse.json({ ok: true, skipped: 'training-lock-held', elapsedMs: Date.now() - start });
  }

  const symbol = await nextSymbolRoundRobin();
  if (!symbol) {
    return NextResponse.json({ ok: true, skipped: 'no-symbols', elapsedMs: Date.now() - start });
  }

  const state = await redisGet<AssetAnalytic>(KEY_STATE(symbol));
  if (!state || state.status !== 'ready') {
    return NextResponse.json({
      ok: true,
      skipped: `not-ready:${state?.status ?? 'missing'}`,
      symbol,
      elapsedMs: Date.now() - start,
    });
  }

  try {
    const ctx = await computeLiveContext(symbol);
    return NextResponse.json({
      ok: true,
      symbol,
      regime: ctx.regime,
      momentumScore: ctx.momentumScore,
      activeRules: ctx.activeRules.length,
      nearestZones: ctx.nearestZones.length,
      elapsedMs: Date.now() - start,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      symbol,
      error: e?.message ?? String(e),
      code: e?.code,
      elapsedMs: Date.now() - start,
    });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
