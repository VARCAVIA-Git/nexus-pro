import { NextResponse } from 'next/server';

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
  const paperKey = process.env.ALPACA_API_KEY ?? '';
  const paperSecret = process.env.ALPACA_API_SECRET ?? '';
  const liveKey = process.env.ALPACA_LIVE_API_KEY ?? '';
  const liveSecret = process.env.ALPACA_LIVE_SECRET_KEY ?? '';

  const paper = paperKey ? await checkAlpaca('https://paper-api.alpaca.markets', paperKey, paperSecret) : { connected: false, error: 'No keys' };
  const live = liveKey && liveSecret ? await checkAlpaca('https://api.alpaca.markets', liveKey, liveSecret) : { connected: false, error: 'Live keys not configured' };

  return NextResponse.json({
    paper,
    live,
    liveConfigured: !!(liveKey && liveSecret),
  });
}
