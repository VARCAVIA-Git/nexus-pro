import { NextResponse } from 'next/server';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

// Pool of assets to scan for top movers
const CRYPTO_POOL = [
  'bitcoin', 'ethereum', 'solana', 'avalanche-2', 'chainlink', 'polkadot',
  'cardano', 'matic-network', 'dogecoin', 'ripple', 'cosmos', 'uniswap',
  'aave', 'aptos', 'arbitrum', 'optimism', 'filecoin', 'litecoin', 'near', 'injective-protocol',
];

const COIN_ID_TO_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', 'avalanche-2': 'AVAX',
  chainlink: 'LINK', polkadot: 'DOT', cardano: 'ADA', 'matic-network': 'MATIC',
  dogecoin: 'DOGE', ripple: 'XRP', cosmos: 'ATOM', uniswap: 'UNI',
  aave: 'AAVE', aptos: 'APT', arbitrum: 'ARB', optimism: 'OP',
  filecoin: 'FIL', litecoin: 'LTC', near: 'NEAR', 'injective-protocol': 'INJ',
};

const STOCK_POOL = [
  'AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'AMD',
  'NFLX', 'CRM', 'COIN', 'PLTR', 'UBER', 'ABNB', 'SNOW', 'MSTR', 'RIOT', 'AVGO',
];

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  type: 'crypto' | 'stock';
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Fetch all crypto and stocks from the pool, then return top 15 movers
 * (by absolute % change) — mix of biggest gainers and losers.
 */
export async function GET() {
  const allPrices: PriceData[] = [];

  // ── Fetch all crypto from CoinGecko (single batched call) ──
  try {
    const ids = CRYPTO_POOL.join(',');
    const cgRes = await fetch(
      `${COINGECKO_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    );
    if (cgRes.ok) {
      const data = await cgRes.json();
      for (const id of CRYPTO_POOL) {
        const coin = data[id];
        const symbol = COIN_ID_TO_SYMBOL[id];
        if (coin && symbol) {
          allPrices.push({
            symbol: `${symbol}/USD`,
            price: coin.usd,
            change24h: coin.usd * ((coin.usd_24h_change ?? 0) / 100),
            changePct24h: coin.usd_24h_change ?? 0,
            type: 'crypto',
          });
        }
      }
    }
  } catch (err) {
    console.error('CoinGecko fetch error:', err);
  }

  // ── Fetch all stocks from Alpaca Data API (works 24/7 with last trade) ──
  const alpacaKey = process.env.ALPACA_API_KEY ?? '';
  const alpacaSecret = process.env.ALPACA_API_SECRET ?? '';
  if (alpacaKey) {
    // Alpaca supports batched snapshots
    try {
      const symbols = STOCK_POOL.join(',');
      const res = await fetch(
        `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols}`,
        { headers: { 'APCA-API-KEY-ID': alpacaKey, 'APCA-API-SECRET-KEY': alpacaSecret } },
      );
      if (res.ok) {
        const data = await res.json();
        for (const sym of STOCK_POOL) {
          const snap = data[sym];
          if (snap?.latestTrade?.p) {
            const price = snap.latestTrade.p;
            const prevClose = snap.prevDailyBar?.c ?? price;
            const change = price - prevClose;
            const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
            allPrices.push({ symbol: sym, price, change24h: change, changePct24h: changePct, type: 'stock' });
          }
        }
      }
    } catch (err) {
      console.error('Alpaca stocks fetch error:', err);
    }
  }

  // ── Pick top 15 movers by absolute % change ──
  const sorted = [...allPrices].sort((a, b) =>
    Math.abs(b.changePct24h) - Math.abs(a.changePct24h)
  );
  const topMovers = sorted.slice(0, 15);

  return NextResponse.json({
    prices: topMovers,
    total: allPrices.length,
    timestamp: new Date().toISOString(),
    sources: { crypto: 'coingecko', stocks: 'alpaca' },
  });
}
