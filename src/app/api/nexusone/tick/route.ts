// NexusOne — Signal/Execution tick (called by cron worker every 30s)

import { NextResponse } from 'next/server';
import { nexusOneTick } from '@/lib/nexusone/worker-tick';
import type { MarketBar } from '@/lib/nexusone/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

// Minimal data fetchers — will be replaced with proper OKX adapter
async function fetchBars(): Promise<MarketBar[]> {
  // For now, use Alpaca 5m bars as proxy
  const key = process.env.ALPACA_API_KEY ?? '';
  const secret = process.env.ALPACA_API_SECRET ?? '';
  if (!key) return [];

  try {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    const params = new URLSearchParams({
      timeframe: '5Min',
      start: start.toISOString(),
      end: end.toISOString(),
      limit: '100',
      symbols: 'BTC/USD',
    });
    const res = await fetch(`https://data.alpaca.markets/v1beta3/crypto/us/bars?${params}`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const bars = data.bars?.['BTC/USD'] ?? [];
    return bars.map((b: any) => ({
      venue: 'alpaca',
      symbol: 'BTC-USD',
      timeframe: '5m',
      ts_open: new Date(b.t).getTime(),
      ts_close: new Date(b.t).getTime() + 5 * 60_000,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));
  } catch { return []; }
}

async function fetchFunding(): Promise<number[]> {
  // Funding rate not available from Alpaca — return empty for now
  // TODO: add OKX funding rate adapter
  return [];
}

async function fetchPrice(): Promise<number> {
  try {
    const key = process.env.ALPACA_API_KEY ?? '';
    const secret = process.env.ALPACA_API_SECRET ?? '';
    const res = await fetch('https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=BTC/USD', {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.trades?.['BTC/USD']?.p ?? 0;
  } catch { return 0; }
}

async function handler(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await nexusOneTick(fetchBars, fetchFunding, fetchPrice);
  return NextResponse.json(result);
}

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
