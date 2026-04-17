// NexusOne v2 — tick endpoint. Called by cron worker every 30s.
import { NextResponse } from 'next/server';
import { runTick } from '@/lib/nexusone/core/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

async function handler(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runTick();
  return NextResponse.json(result);
}

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
