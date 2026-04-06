import { NextResponse } from 'next/server';
import { redisGet } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const lastTick = await redisGet('nexus:debug:lastTick');
  return NextResponse.json({ lastTick });
}
