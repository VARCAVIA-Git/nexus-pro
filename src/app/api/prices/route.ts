import { NextResponse } from 'next/server';
import { redisGet } from '@/lib/db/redis';
import { getAlpacaKeys, alpacaFetch } from '@/lib/broker/alpaca-keys';

const TWELVE_DATA_URL = 'https://api.twelvedata.com';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

const DEFAULT_CRYPTO = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'DOT'];
const DEFAULT_STOCKS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'];

const COIN_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
  AVAX: 'avalanche-2', LINK: 'chainlink', DOT: 'polkadot',
  ADA: 'cardano', MATIC: 'matic-network', DOGE: 'dogecoin', XRP: 'ripple',
  ATOM: 'cosmos', UNI: 'uniswap', AAVE: 'aave', APT: 'aptos', ARB: 'arbitrum',
  OP: 'optimism', FIL: 'filecoin', LTC: 'litecoin', NEAR: 'near', INJ: 'injective-protocol',
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

  // Load user's ticker selection (any userId — we use global key for now)
  let selectedAssets: string[] | null = null;
  try {
    // Try to find any user's ticker config
    const keys = await redisGet<string[]>('nexus:global:ticker_assets');
    if (keys && Array.isArray(keys)) selectedAssets = keys;
  } catch {}

  // Split into crypto and stocks — respect user selection exactly
  const allCrypto = Object.keys(COIN_ID_MAP);
  const hasSelection = Array.isArray(selectedAssets) && selectedAssets.length > 0;
  const cryptoSymbols = hasSelection ? selectedAssets!.filter(a => allCrypto.includes(a)) : DEFAULT_CRYPTO;
  const stockSymbols = hasSelection ? selectedAssets!.filter(a => !allCrypto.includes(a)) : DEFAULT_STOCKS;

  // ── Fetch crypto from CoinGecko ──
  try {
    const ids = cryptoSymbols.map(s => COIN_ID_MAP[s]).filter(Boolean).join(',');
    if (ids) {
      const cgRes = await fetch(
        `${COINGECKO_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      );
      if (cgRes.ok) {
        const data = await cgRes.json();
        for (const symbol of cryptoSymbols) {
          const id = COIN_ID_MAP[symbol];
          const coin = data[id];
          if (coin) {
            results.push({
              symbol: `${symbol}/USD`,
              price: coin.usd,
              change24h: coin.usd * ((coin.usd_24h_change ?? 0) / 100),
              changePct24h: coin.usd_24h_change ?? 0,
              type: 'crypto',
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('CoinGecko fetch error:', err);
  }

  // ── Fetch stocks from Twelve Data ──
  const tdKey = process.env.TWELVE_DATA_API_KEY;
  if (tdKey && stockSymbols.length > 0) {
    try {
      const joined = stockSymbols.join(',');
      const tdRes = await fetch(
        `${TWELVE_DATA_URL}/quote?symbol=${joined}&apikey=${tdKey}`,
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

  // ── Fallback: fetch missing stocks from Alpaca (works when market closed) ──
  const fetchedStockSymbols = new Set(results.filter(r => r.type === 'stock').map(r => r.symbol));
  const missingStocks = stockSymbols.filter(s => !fetchedStockSymbols.has(s));
  if (missingStocks.length > 0) {
    try {
      const keys = await getAlpacaKeys();
      if (keys) {
        for (const sym of missingStocks.slice(0, 10)) {
          const snap = await alpacaFetch<any>(`/v2/stocks/${sym}/snapshot`, keys);
          if (snap?.latestTrade?.p) {
            const price = snap.latestTrade.p;
            const prevClose = snap.prevDailyBar?.c ?? price;
            const change = price - prevClose;
            const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
            results.push({ symbol: sym, price, change24h: change, changePct24h: changePct, type: 'stock' });
          }
        }
      }
    } catch {}
  }

  return NextResponse.json({
    prices: results,
    timestamp: new Date().toISOString(),
    sources: { crypto: 'coingecko', stocks: 'twelvedata' },
  });
}
