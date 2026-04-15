// ═══════════════════════════════════════════════════════════════
// Cron route: Auto-Retrain tick (Phase 3)
// Esegue scheduleAutoRetrain (1 enqueue max per chiamata)
// + processNextIncremental (1 incremental per tick).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { redisExists } from '@/lib/db/redis';
import {
  scheduleAutoRetrain,
  processNextIncremental,
} from '@/lib/analytics/incremental-trainer';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
    return NextResponse.json({
      ok: true,
      skipped: 'training-lock-held',
      elapsedMs: Date.now() - start,
    });
  }

  const errors: string[] = [];

  // 1. Decide se schedulare un retrain (full o incremental)
  let scheduled: any = null;
  try {
    scheduled = await scheduleAutoRetrain();
  } catch (e) {
    errors.push(`schedule:${(e as Error).message}`);
  }

  // 2. Processa il prossimo incremental (se presente in coda)
  let incrementalResult: any = null;
  try {
    incrementalResult = await processNextIncremental();
  } catch (e) {
    errors.push(`process:${(e as Error).message}`);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    scheduled,
    incrementalResult,
    errors,
    elapsedMs: Date.now() - start,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
