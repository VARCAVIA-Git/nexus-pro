// NexusOne — Signal/Execution tick (called by cron worker every 30s)

import { NextResponse } from 'next/server';
import { nexusOneTick } from '@/lib/nexusone/worker-tick';
import { fetchBars, fetchFunding, fetchLivePrice } from '@/lib/nexusone/data/market-data';
import type { MarketBar } from '@/lib/nexusone/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

const SYMBOL = 'BTC/USD';

async function getBars(): Promise<MarketBar[]> {
  const bars = await fetchBars(SYMBOL, '5m', 100);
  return bars.map(b => ({
    venue: 'alpaca',
    symbol: 'BTC-USD',
    timeframe: '5m',
    ts_open: b.ts_open,
    ts_close: b.ts_open + 5 * 60_000,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

async function getFunding(): Promise<number[]> {
  return fetchFunding(SYMBOL, 100);
}

async function getPrice(): Promise<number> {
  return fetchLivePrice(SYMBOL);
}

async function handler(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await nexusOneTick(getBars, getFunding, getPrice);
  return NextResponse.json(result);
}

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
