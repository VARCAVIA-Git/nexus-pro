import { NextResponse } from 'next/server';
import { redisPing } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

async function handler() {
  const redisOk = await redisPing();
  return NextResponse.json({
    status: 'ok',
    version: 'nexusone-1.0',
    redis: redisOk,
    timestamp: new Date().toISOString(),
  });
}

export async function GET() { return handler(); }
export async function POST() { return handler(); }
