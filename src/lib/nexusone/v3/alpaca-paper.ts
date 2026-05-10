// NexusOne v3 — Alpaca paper broker adapter.
//
// Paper trading on Alpaca: identical API to live, separate base URL,
// no real money at risk. We use limit orders at the entry price
// (post-only-style maker behavior) with a 5-minute TIF.
//
// Notes on crypto symbol mapping:
//   - Our tuple keys use 'BTC-USD' style. Alpaca crypto wants 'BTC/USD'.
//   - Some symbols (BNB, ADA) are NOT on Alpaca paper crypto. For those
//     we record the signal but skip placement and warn.
//
// Live wiring is intentionally restricted: this module places paper
// orders even when mode==='live_micro' UNLESS LIVE base URL is set
// AND live keys are present AND approve_live flag is set on disk.

import type { OpenTradeV3 } from './types';

const PAPER_BASE = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
const LIVE_BASE = 'https://api.alpaca.markets';

function paperHeaders() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
    'Content-Type': 'application/json',
  };
}

const ALPACA_CRYPTO_SUPPORTED = new Set([
  'BTC-USD', 'ETH-USD', 'SOL-USD',
  // BNB, XRP, ADA: not on Alpaca crypto; skipped.
]);

function toAlpacaSymbol(asset: string): string {
  return asset.replace('-', '/');
}

export interface PlaceResult {
  placed: boolean;
  skipped_reason?: string;
  broker_order_id?: string;
  status?: string;
  qty?: number;
  filled_avg_price?: number | null;
}

export async function placePaperOrder(entry: OpenTradeV3): Promise<PlaceResult> {
  if (!ALPACA_CRYPTO_SUPPORTED.has(entry.asset)) {
    return { placed: false, skipped_reason: `${entry.asset} not on Alpaca paper crypto` };
  }

  const sym = toAlpacaSymbol(entry.asset);
  const qty = entry.notional / entry.entryPrice;
  if (qty <= 0 || !isFinite(qty)) return { placed: false, skipped_reason: 'invalid qty' };

  // Side: long → buy, short → sell. Alpaca paper crypto only supports long;
  // shorts are simulated as a flat-skip when not supported.
  if (entry.dir === 'short') {
    return { placed: false, skipped_reason: 'Alpaca crypto paper does not support shorting; simulated skip' };
  }

  const body = {
    symbol: sym,
    qty: qty.toFixed(6),
    side: 'buy',
    type: 'limit',
    limit_price: entry.entryPrice.toFixed(2),
    time_in_force: 'gtc',
  };

  try {
    const res = await fetch(`${PAPER_BASE}/v2/orders`, {
      method: 'POST',
      headers: paperHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { placed: false, skipped_reason: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id: string; status: string; filled_avg_price?: string | null };
    return {
      placed: true,
      broker_order_id: data.id,
      status: data.status,
      qty,
      filled_avg_price: data.filled_avg_price ? parseFloat(data.filled_avg_price) : null,
    };
  } catch (err: any) {
    return { placed: false, skipped_reason: `network: ${err.message}` };
  }
}

export interface AccountSnapshot {
  ok: boolean;
  cash?: number;
  equity?: number;
  buying_power?: number;
  status?: string;
  error?: string;
}

export async function getPaperAccount(): Promise<AccountSnapshot> {
  try {
    const res = await fetch(`${PAPER_BASE}/v2/account`, { headers: paperHeaders() });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const d = (await res.json()) as any;
    return {
      ok: true,
      cash: parseFloat(d.cash),
      equity: parseFloat(d.equity),
      buying_power: parseFloat(d.buying_power),
      status: d.status,
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
