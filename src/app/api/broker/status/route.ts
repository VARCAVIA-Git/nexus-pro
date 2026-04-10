import { NextResponse } from 'next/server';
import { redisGet } from '@/lib/db/redis';
import { decrypt } from '@/lib/utils/encryption';

export const dynamic = 'force-dynamic';

async function checkAlpaca(baseUrl: string, key: string, secret: string) {
  try {
    const res = await fetch(`${baseUrl}/v2/account`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const acc = await res.json();
    return {
      connected: true,
      equity: parseFloat(acc.equity),
      cash: parseFloat(acc.cash),
      buyingPower: parseFloat(acc.buying_power),
      status: acc.status,
      accountType: acc.account_number?.startsWith('PA') ? 'paper' : 'live',
    };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}

export async function GET() {
  // Try env vars first, then fall back to Redis-saved keys (encrypted)
  let savedLiveKey = '';
  let savedLiveSecret = '';
  try {
    const savedKeys = await redisGet<Record<string, any>>('nexus:broker:keys');
    if (savedKeys?.liveKey) savedLiveKey = String(savedKeys.liveKey);
    if (savedKeys?.liveSecret) savedLiveSecret = String(savedKeys.liveSecret);
  } catch (e: any) {
    console.warn('[broker-status] Redis/decrypt error:', e.message);
  }

  const paperKey = process.env.ALPACA_API_KEY || '';
  const paperSecret = process.env.ALPACA_API_SECRET || '';
  const liveKey = process.env.ALPACA_LIVE_API_KEY || savedLiveKey || '';
  const liveSecret = process.env.ALPACA_LIVE_SECRET_KEY || savedLiveSecret || '';

  const paper = paperKey ? await checkAlpaca('https://paper-api.alpaca.markets', paperKey, paperSecret) : { connected: false, error: 'No keys' };
  const live = liveKey && liveSecret ? await checkAlpaca('https://api.alpaca.markets', liveKey, liveSecret) : { connected: false, error: 'Live keys not configured' };

  return NextResponse.json({
    paper,
    live,
    liveConfigured: !!(liveKey && liveSecret),
  });
}
