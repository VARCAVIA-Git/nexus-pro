// NexusOne v2 — get/set trading mode (disabled | paper).
// Protected by the CRON_SECRET header to prevent accidental flips.
import { NextResponse } from 'next/server';
import { getMode, setMode, type V2Mode } from '@/lib/nexusone/core/orchestrator';

export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ mode: await getMode() });
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const mode = body?.mode as V2Mode | undefined;
  if (mode !== 'disabled' && mode !== 'paper') {
    return NextResponse.json({ error: 'mode must be "disabled" or "paper"' }, { status: 400 });
  }
  await setMode(mode);
  return NextResponse.json({ mode });
}
