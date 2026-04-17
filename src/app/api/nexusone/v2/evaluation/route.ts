// NexusOne v2 — go/warning/no-go verdict.
import { NextResponse } from 'next/server';
import { evaluate } from '@/lib/nexusone/monitoring/evaluation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(30, Number(searchParams.get('days') ?? 7)));
  const result = await evaluate(days);
  return NextResponse.json({ window_days: days, ...result });
}
