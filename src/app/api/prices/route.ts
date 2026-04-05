import { NextResponse } from 'next/server';

const TWELVE_DATA_URL = 'https://api.twelvedata.com';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD', 'DOT/USD'];
const STOCK_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'];

const COIN_ID_MAP: Record<string, string> = {
  'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana',
  'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot',
};

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  type: 'crypto' | 'stock';
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const results: PriceData[] = [];

  // ── Fetch crypto from CoinGecko ──
  try {
    const ids = CRYPTO_SYMBOLS.map((s) => COIN_ID_MAP[s]).filter(Boolean).join(',');
    const cgRes = await fetch(
      `${COINGECKO_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 30 } },
    );

    if (cgRes.ok) {
      const data = await cgRes.json();
      for (const symbol of CRYPTO_SYMBOLS) {
        const id = COIN_ID_MAP[symbol];
        const coin = data[id];
        if (coin) {
          results.push({
            symbol,
            price: coin.usd,
            change24h: coin.usd * (coin.usd_24h_change / 100),
            changePct24h: coin.usd_24h_change ?? 0,
            type: 'crypto',
          });
        }
      }
    }
  } catch (err) {
    console.error('CoinGecko fetch error:', err);
  }

  // ── Fetch stocks from Twelve Data ──
  const tdKey = process.env.TWELVE_DATA_API_KEY;
  if (tdKey) {
    try {
      const joined = STOCK_SYMBOLS.join(',');
      const tdRes = await fetch(
        `${TWELVE_DATA_URL}/quote?symbol=${joined}&apikey=${tdKey}`,
        { next: { revalidate: 60 } },
      );

      if (tdRes.ok) {
        const raw = await tdRes.json();
        const items = Array.isArray(raw) ? raw : [raw];
        for (const item of items) {
          if (item.symbol && item.close) {
            results.push({
              symbol: item.symbol,
              price: parseFloat(item.close),
              change24h: parseFloat(item.change || '0'),
              changePct24h: parseFloat(item.percent_change || '0'),
              type: 'stock',
            });
          }
        }
      }
    } catch (err) {
      console.error('Twelve Data fetch error:', err);
    }
  }

  return NextResponse.json({
    prices: results,
    timestamp: new Date().toISOString(),
    sources: { crypto: 'coingecko', stocks: 'twelvedata' },
  });
}
