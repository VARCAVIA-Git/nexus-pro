// ═══════════════════════════════════════════════════════════════
// Cron route: Mine tick (Phase 4)
// Called every 60s by the cron worker.
// Auth: x-cron-secret header (PM2).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { redisGet } from '@/lib/db/redis';
import { executeMineeTick } from '@/lib/mine/mine-tick';
import type { DataLoaders } from '@/lib/mine/mine-tick';
import type { LiveContext, AnalyticReport, NewsDigest, MacroEvent } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

const loaders: DataLoaders = {
  async loadLiveContext(symbol: string): Promise<LiveContext | null> {
    return redisGet<LiveContext>(`nexus:analytic:live:${symbol}`);
  },
  async loadReport(symbol: string): Promise<AnalyticReport | null> {
    const state = await redisGet<{ report?: AnalyticReport }>(`nexus:analytic:${symbol}`);
    return state?.report ?? null;
  },
  async loadNews(symbol: string): Promise<NewsDigest | null> {
    return redisGet<NewsDigest>(`nexus:news:digest:${symbol}`);
  },
  async loadMacroEvents(): Promise<MacroEvent[]> {
    return (await redisGet<MacroEvent[]>('nexus:macro:events')) ?? [];
  },
};

async function handler(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await executeMineeTick(loaders);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? String(e),
    }, { status: 500 });
  }
}

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
