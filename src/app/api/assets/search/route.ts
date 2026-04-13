import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet, redisSMembers } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

// Popular crypto with CoinGecko IDs
const CRYPTO_DB: Record<string, { name: string; id: string }> = {
  BTC: { name: 'Bitcoin', id: 'bitcoin' }, ETH: { name: 'Ethereum', id: 'ethereum' },
  SOL: { name: 'Solana', id: 'solana' }, AVAX: { name: 'Avalanche', id: 'avalanche-2' },
  LINK: { name: 'Chainlink', id: 'chainlink' }, DOT: { name: 'Polkadot', id: 'polkadot' },
  ADA: { name: 'Cardano', id: 'cardano' }, XRP: { name: 'Ripple', id: 'ripple' },
  DOGE: { name: 'Dogecoin', id: 'dogecoin' }, MATIC: { name: 'Polygon', id: 'matic-network' },
  ATOM: { name: 'Cosmos', id: 'cosmos' }, UNI: { name: 'Uniswap', id: 'uniswap' },
  AAVE: { name: 'Aave', id: 'aave' }, LTC: { name: 'Litecoin', id: 'litecoin' },
  NEAR: { name: 'NEAR', id: 'near' }, ARB: { name: 'Arbitrum', id: 'arbitrum' },
  OP: { name: 'Optimism', id: 'optimism' }, APT: { name: 'Aptos', id: 'aptos' },
  FIL: { name: 'Filecoin', id: 'filecoin' }, INJ: { name: 'Injective', id: 'injective-protocol' },
  SUI: { name: 'Sui', id: 'sui' }, SEI: { name: 'Sei', id: 'sei-network' },
  TIA: { name: 'Celestia', id: 'celestia' }, PEPE: { name: 'Pepe', id: 'pepe' },
  WIF: { name: 'dogwifhat', id: 'dogwifcoin' }, RENDER: { name: 'Render', id: 'render-token' },
};

// Popular US stocks
const STOCK_DB: Record<string, string> = {
  AAPL: 'Apple', NVDA: 'NVIDIA', TSLA: 'Tesla', MSFT: 'Microsoft',
  GOOGL: 'Alphabet', AMZN: 'Amazon', META: 'Meta', SPY: 'S&P 500 ETF',
  QQQ: 'Nasdaq ETF', AMD: 'AMD', NFLX: 'Netflix', CRM: 'Salesforce',
  COIN: 'Coinbase', PLTR: 'Palantir', UBER: 'Uber', ABNB: 'Airbnb',
  SNOW: 'Snowflake', MSTR: 'MicroStrategy', RIOT: 'Riot Platforms',
  SQ: 'Block', AVGO: 'Broadcom', INTC: 'Intel', DIS: 'Disney',
  BA: 'Boeing', JPM: 'JPMorgan', GS: 'Goldman Sachs', V: 'Visa',
  MA: 'Mastercard', PYPL: 'PayPal', SHOP: 'Shopify', RBLX: 'Roblox',
};

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').toUpperCase().trim();
  const type = url.searchParams.get('type') ?? 'all';

  if (!q) return NextResponse.json({ results: [] });

  // Get tracked assets
  let tracked: string[] = [];
  try { tracked = await redisSMembers('nexus:analytic:list') ?? []; } catch {}
  const trackedSet = new Set(tracked);

  const results: Array<{ symbol: string; name: string; type: 'crypto' | 'stock'; tracked: boolean }> = [];

  // Search crypto
  if (type === 'all' || type === 'crypto') {
    for (const [sym, info] of Object.entries(CRYPTO_DB)) {
      if (sym.includes(q) || info.name.toUpperCase().includes(q)) {
        const fullSymbol = `${sym}/USD`;
        results.push({ symbol: fullSymbol, name: info.name, type: 'crypto', tracked: trackedSet.has(fullSymbol) });
      }
    }
  }

  // Search stocks
  if (type === 'all' || type === 'stock') {
    for (const [sym, name] of Object.entries(STOCK_DB)) {
      if (sym.includes(q) || name.toUpperCase().includes(q)) {
        results.push({ symbol: sym, name, type: 'stock', tracked: trackedSet.has(sym) });
      }
    }
  }

  return NextResponse.json({ results: results.slice(0, 20) });
}
