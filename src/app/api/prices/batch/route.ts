import { NextResponse } from 'next/server';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3';
const COIN_MAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', AVAX: 'avalanche-2',
  LINK: 'chainlink', DOT: 'polkadot', ADA: 'cardano', XRP: 'ripple',
  DOGE: 'dogecoin', MATIC: 'matic-network', ATOM: 'cosmos', UNI: 'uniswap',
  AAVE: 'aave', LTC: 'litecoin', NEAR: 'near', ARB: 'arbitrum',
  OP: 'optimism', APT: 'aptos', FIL: 'filecoin', INJ: 'injective-protocol',
};

export const dynamic = 'force-dynamic';

// 10s cache
let cache: { data: Record<string, number>; ts: number } | null = null;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const symbols: string[] = body.symbols ?? [];
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ prices: {} });
  }

  // Cache hit
  if (cache && Date.now() - cache.ts < 10_000) {
    const result: Record<string, number> = {};
    for (const s of symbols) {
      if (cache.data[s]) result[s] = cache.data[s];
    }
    if (Object.keys(result).length > 0) {
      return NextResponse.json({ prices: result, cached: true });
    }
  }

  const prices: Record<string, number> = {};

  // Batch crypto via CoinGecko
  const cryptoSymbols = symbols.filter(s => s.includes('/'));
  if (cryptoSymbols.length > 0) {
    const ids = cryptoSymbols
      .map(s => COIN_MAP[s.replace('/USD', '')])
      .filter(Boolean).join(',');
    if (ids) {
      try {
        const res = await fetch(`${COINGECKO_URL}/simple/price?ids=${ids}&vs_currencies=usd`);
        if (res.ok) {
          const data = await res.json();
          for (const s of cryptoSymbols) {
            const id = COIN_MAP[s.replace('/USD', '')];
            if (data[id]?.usd) prices[s] = data[id].usd;
          }
        }
      } catch {}
    }
  }

  // Batch stocks via Alpaca
  const stockSymbols = symbols.filter(s => !s.includes('/'));
  if (stockSymbols.length > 0) {
    const key = process.env.ALPACA_API_KEY ?? '';
    const secret = process.env.ALPACA_API_SECRET ?? '';
    if (key) {
      try {
        const joined = stockSymbols.join(',');
        const res = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${joined}`, {
          headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        });
        if (res.ok) {
          const data = await res.json();
          for (const sym of stockSymbols) {
            if (data[sym]?.latestTrade?.p) prices[sym] = data[sym].latestTrade.p;
          }
        }
      } catch {}
    }
  }

  cache = { data: { ...(cache?.data ?? {}), ...prices }, ts: Date.now() };
  return NextResponse.json({ prices });
}
