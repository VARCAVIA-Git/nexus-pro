// ═══════════════════════════════════════════════════════════════
// Asset Intelligence Aggregator
// Unifies data from FMP, CryptoPanic, CoinMarketCap, Finnhub
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getEarningsCalendar, getAnalystRating } from '@/lib/data-providers/fmp';
import { getCmcQuote, getCmcGlobalMetrics } from '@/lib/data-providers/coinmarketcap';
import { getCompanyProfile, getRecommendation, getCompanyNews, getBasicFinancials } from '@/lib/data-providers/finnhub';
import { getEconomicEvents } from '@/lib/data-providers/trading-economics';
import { getNewsDigest } from '@/lib/analytics/news/news-aggregator';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

// Cache aggregated intel for 5 minutes per symbol
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);

  // Cache hit
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const isCrypto = symbol.includes('/');

  // Run all providers in parallel
  const [
    economicEvents,
    newsDigest,
    cmcQuote,
    cmcGlobal,
    earnings,
    analystRating,
    companyProfile,
    recommendation,
    companyNews,
    financials,
  ] = await Promise.allSettled([
    getEconomicEvents(),
    isCrypto ? getNewsDigest(symbol) : Promise.resolve(null),
    isCrypto ? getCmcQuote(symbol) : Promise.resolve(null),
    isCrypto ? getCmcGlobalMetrics() : Promise.resolve(null),
    !isCrypto ? getEarningsCalendar(symbol) : Promise.resolve([]),
    !isCrypto ? getAnalystRating(symbol) : Promise.resolve(null),
    !isCrypto ? getCompanyProfile(symbol) : Promise.resolve(null),
    !isCrypto ? getRecommendation(symbol) : Promise.resolve(null),
    !isCrypto ? getCompanyNews(symbol, 8) : Promise.resolve([]),
    !isCrypto ? getBasicFinancials(symbol) : Promise.resolve(null),
  ]);

  const unwrap = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const data = {
    symbol,
    type: isCrypto ? 'crypto' : 'stock',
    macro: {
      events: unwrap(economicEvents, [] as any[]),
    },
    crypto: isCrypto ? {
      quote: unwrap(cmcQuote, null),
      global: unwrap(cmcGlobal, null),
      news: (() => {
        const digest = unwrap(newsDigest, null) as any;
        const items = digest?.topItems ?? digest?.items ?? [];
        if (!Array.isArray(items)) return [];
        return items.slice(0, 8).map((item: any) => ({
          id: item.id ?? Math.random(),
          title: item.title,
          url: item.url,
          source: item.source,
          publishedAt: item.publishedAt ?? new Date(item.timestamp ?? Date.now()).toISOString(),
          votes: {
            positive: (item.sentimentScore ?? 0) > 0.1 ? Math.round((item.sentimentScore ?? 0) * 10) : 0,
            negative: (item.sentimentScore ?? 0) < -0.1 ? Math.round(-(item.sentimentScore ?? 0) * 10) : 0,
            important: 0,
          },
          kind: 'news',
        }));
      })(),
    } : null,
    stock: !isCrypto ? {
      profile: unwrap(companyProfile, null),
      recommendation: unwrap(recommendation, null),
      financials: unwrap(financials, null),
      analystRating: unwrap(analystRating, null),
      earnings: unwrap(earnings, [] as any[]),
      news: unwrap(companyNews, [] as any[]),
    } : null,
    providers: {
      fmp: !!process.env.FMP_API_KEY,
      cmc: !!process.env.COINMARKETCAP_API_KEY,
      finnhub: !!process.env.FINNHUB_API_KEY,
      cryptopanic: true, // works without key
    },
    generatedAt: new Date().toISOString(),
  };

  cache.set(symbol, { data, ts: Date.now() });
  return NextResponse.json(data);
}
