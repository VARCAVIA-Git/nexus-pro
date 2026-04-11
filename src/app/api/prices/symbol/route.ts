import { NextResponse } from 'next/server';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

const COIN_ID_MAP: Record<string, string> = {
  'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana',
  'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot',
  'ADA/USD': 'cardano', 'XRP/USD': 'ripple', 'DOGE/USD': 'dogecoin',
};

// Cache to avoid hammering APIs (5s TTL — fast enough to feel live)
const cache = new Map<string, { price: number; ts: number }>();
const TTL = 5_000;

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

  let price: number | null = null;

  // Crypto via CoinGecko
  if (symbol.includes('/')) {
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
  } else {
    // Stock via Alpaca data API
    const key = process.env.ALPACA_API_KEY ?? '';
    const secret = process.env.ALPACA_API_SECRET ?? '';
    if (key) {
      try {
        const res = await fetch(`https://data.alpaca.markets/v2/stocks/${symbol}/snapshot`, {
          headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        });
        if (res.ok) {
          const snap = await res.json();
          if (snap?.latestTrade?.p) price = snap.latestTrade.p;
        }
      } catch {}
    }
  }

  if (price === null) return NextResponse.json({ error: 'Price unavailable' }, { status: 404 });

  cache.set(symbol, { price, ts: Date.now() });
  return NextResponse.json({ symbol, price });
}
