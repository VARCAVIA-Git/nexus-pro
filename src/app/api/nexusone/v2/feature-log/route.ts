/**
 * src/app/api/nexusone/v2/feature-log/route.ts
 *
 * API route for passive feature logging.
 * Called by cron worker every 60s (slow tick).
 * Independent from the trading tick — runs even when mode=disabled.
 *
 * Follows the same pattern as /api/nexusone/v2/tick:
 * - POST only (cron worker sends POST)
 * - CRON_SECRET auth check
 * - Returns JSON with result summary
 */

import { NextResponse } from 'next/server';
import { logFeatures } from '@/lib/nexusone/research/feature-logger';

// Optional: import regime if available from the v2 orchestrator state
// import { getCurrentRegime } from '@/lib/nexusone/core/regime-detector';

export async function POST(req: Request): Promise<NextResponse> {
  // Auth check (same as other nexusone routes)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get('x-cron-secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    // Try to get current regime from Redis (if v2 is running)
    let regime: string | undefined;
    try {
      // Lazy import to avoid circular dependencies
      const { redisGet } = await import('@/lib/db/redis');
      const regimeState = await redisGet<{ current: string }>('nexusone:v2:regime');
      regime = regimeState?.current;
    } catch {
      // Redis not available or regime not set — fine, log without it
    }

    const result = await logFeatures(regime);

    // Concise log line matching cron-worker format
    const status = result.errors.length > 0 ? 'partial' : 'ok';
    console.log(
      `[feature-log] ${status} ins=${result.rows_inserted} bf=${result.rows_backfilled} ` +
      `err=${result.errors.length} ${result.elapsed_ms}ms`,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[feature-log] fatal:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}

// GET for manual testing / health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: 'nexusone-feature-log',
    status: 'ok',
    description: 'Passive multi-dimensional feature logger. POST to trigger a tick.',
  });
}
