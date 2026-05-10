// NexusOne v3 — direct OKX bar fetch (no Next/Redis dependency).
// Used by the local PM2 runner so the runtime works outside the Next route.

import type { BarV3 } from './types';

const OKX_BASE = 'https://www.okx.com/api/v5';

const OKX_INST: Record<string, string> = {
  'BTC-USD': 'BTC-USDT-SWAP',
  'ETH-USD': 'ETH-USDT-SWAP',
  'SOL-USD': 'SOL-USDT-SWAP',
  'BNB-USD': 'BNB-USDT-SWAP',
  'XRP-USD': 'XRP-USDT-SWAP',
  'ADA-USD': 'ADA-USDT-SWAP',
};

const OKX_BAR: Record<string, string> = { '1H': '1H', '4H': '4H' };

export async function fetchOkxBars(asset: string, tf: '1H' | '4H', limit = 250): Promise<BarV3[]> {
  const inst = OKX_INST[asset];
  const bar = OKX_BAR[tf];
  if (!inst || !bar) return [];

  const url = `${OKX_BASE}/market/candles?instId=${inst}&bar=${bar}&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { code: string; data: string[][] };
    if (data.code !== '0') return [];
    // OKX returns newest first → reverse.
    return (data.data ?? []).reverse().map((c) => ({
      ts: parseInt(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]),
    }));
  } catch {
    return [];
  }
}
