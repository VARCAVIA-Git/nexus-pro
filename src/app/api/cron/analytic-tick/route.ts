// ═══════════════════════════════════════════════════════════════
// Cron tick per il pipeline AI Analytic.
// Esegue (in parallelo): observe loop sui ready + queue worker single-shot.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { tickObservationLoop, tickQueueWorker } from '@/lib/analytics/analytic-loop';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true; // dev: nessun check
  const provided = req.headers.get('x-cron-secret');
  return provided === required;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const errors: string[] = [];
  let observed = 0;
  let processed = false;

  const results = await Promise.allSettled([tickObservationLoop(), tickQueueWorker()]);

  if (results[0].status === 'fulfilled') {
    observed = results[0].value;
  } else {
    errors.push(`observe: ${results[0].reason?.message ?? results[0].reason}`);
  }
  if (results[1].status === 'fulfilled') {
    processed = results[1].value;
  } else {
    errors.push(`queue: ${results[1].reason?.message ?? results[1].reason}`);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    observed,
    processed,
    errors,
    elapsedMs: Date.now() - start,
  });
}

// GET come fallback comodo per testing manuale via curl/browser
export async function GET(req: Request) {
  return POST(req);
}
