// NexusOne — Emergency Stop

import { NextResponse } from 'next/server';
import { setSystemMode } from '@/lib/nexusone/strategy-registry';
import { triggerKillSwitch } from '@/lib/nexusone/risk-engine';
import { closeTrade } from '@/lib/nexusone/execution-engine';

export const dynamic = 'force-dynamic';

export async function POST() {
  // 1. Trigger kill switch
  await triggerKillSwitch('EMERGENCY STOP by user');

  // 2. Close any open trade at market
  try {
    const key = process.env.ALPACA_API_KEY ?? '';
    const secret = process.env.ALPACA_API_SECRET ?? '';
    const res = await fetch('https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=BTC/USD', {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    const data = await res.json();
    const price = data.trades?.['BTC/USD']?.p ?? 0;
    if (price > 0) {
      await closeTrade(price, 'kill_switch');
    }
  } catch {}

  // 3. Disable system
  await setSystemMode('disabled');

  return NextResponse.json({ ok: true, message: 'Emergency stop executed. System disabled.' });
}
