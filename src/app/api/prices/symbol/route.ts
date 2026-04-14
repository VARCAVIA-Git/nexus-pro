import { NextResponse } from 'next/server';

const ALPACA_DATA = 'https://data.alpaca.markets';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

const COIN_ID_MAP: Record<string, string> = {
  'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana',
  'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot',
  'ADA/USD': 'cardano', 'XRP/USD': 'ripple', 'DOGE/USD': 'dogecoin',
};

// Cache: 10s TTL — Alpaca rate limit is 200/min, this keeps us well under
const cache = new Map<string, { price: number; ts: number }>();
const TTL = 10_000;

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });

  // Cache hit
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({ symbol, price: cached.price, cached: true });
  }

  const key = process.env.ALPACA_API_KEY ?? '';
  const secret = process.env.ALPACA_API_SECRET ?? '';
  let price: number | null = null;

  if (symbol.includes('/')) {
    // Crypto: Alpaca first (reliable, no rate limit issues), CoinGecko fallback
    if (key) {
      try {
        const res = await fetch(`${ALPACA_DATA}/v1beta3/crypto/us/latest/trades?symbols=${symbol}`, {
          headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        });
        if (res.ok) {
          const data = await res.json();
          const trade = data?.trades?.[symbol];
          if (trade?.p) price = trade.p;
        }
      } catch {}
    }

    // Fallback: CoinGecko (rate limited on free tier)
    if (price === null) {
      const id = COIN_ID_MAP[symbol];
      if (id) {
        try {
          const res = await fetch(`${COINGECKO_URL}/simple/price?ids=${id}&vs_currencies=usd`);
          if (res.ok) {
            const data = await res.json();
            if (data[id]?.usd) price = data[id].usd;
          }
        } catch {}
      }
    }
  } else {
    // Stock via Alpaca snapshot
    if (key) {
      try {
        const res = await fetch(`${ALPACA_DATA}/v2/stocks/${symbol}/snapshot`, {
          headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        });
        if (res.ok) {
          const snap = await res.json();
          if (snap?.latestTrade?.p) price = snap.latestTrade.p;
        }
      } catch {}
    }
  }

  if (price === null) {
    // Serve stale cache if available (better than nothing)
    if (cached) {
      return NextResponse.json({ symbol, price: cached.price, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Price unavailable' }, { status: 404 });
  }

  cache.set(symbol, { price, ts: Date.now() });
  return NextResponse.json({ symbol, price });
}
