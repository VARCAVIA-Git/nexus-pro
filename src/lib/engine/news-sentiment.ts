// ═══════════════════════════════════════════════════════════════
// News Sentiment Engine — keyword-based scoring
// Sources: Alpaca News API (free), CoinGecko status updates
// ═══════════════════════════════════════════════════════════════

import type { NewsSentiment } from '@/types/intelligence';
import { redisGet, redisSet } from '@/lib/db/redis';

const ALPACA_NEWS_URL = 'https://data.alpaca.markets/v1beta1/news';

const POSITIVE = ['surge', 'rally', 'bullish', 'partnership', 'approval', 'record high', 'upgrade', 'beat expectations', 'all-time high', 'growth', 'profit', 'revenue beat', 'breakout', 'adoption', 'launch', 'expansion'];
const NEGATIVE = ['crash', 'bearish', 'hack', 'lawsuit', 'ban', 'downgrade', 'miss expectations', 'bankruptcy', 'layoff', 'investigation', 'fine', 'recall', 'decline', 'selloff', 'warning', 'fraud'];
const HIGH_IMPACT = ['fed', 'interest rate', 'cpi', 'inflation', 'regulation', 'sec', 'earnings', 'fomc', 'gdp', 'jobs report', 'tariff', 'sanctions'];

function scoreSentiment(text: string): { score: number; isHighImpact: boolean } {
  const lower = text.toLowerCase();
  let score = 0;
  let isHighImpact = false;

  for (const word of POSITIVE) { if (lower.includes(word)) score += 15; }
  for (const word of NEGATIVE) { if (lower.includes(word)) score -= 15; }
  for (const word of HIGH_IMPACT) { if (lower.includes(word)) isHighImpact = true; }

  return { score: Math.max(-100, Math.min(100, score)), isHighImpact };
}

/** Fetch news from Alpaca News API (free with paper account) */
async function fetchAlpacaNews(symbol: string): Promise<Array<{ title: string; source: string; time: string }>> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return [];

  const alpacaSymbol = symbol.includes('/') ? symbol.replace('/', '') : symbol;
  try {
    const res = await fetch(`${ALPACA_NEWS_URL}?symbols=${alpacaSymbol}&limit=10&sort=desc`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.news ?? []).map((n: any) => ({
      title: n.headline ?? n.summary ?? '',
      source: n.source ?? 'alpaca',
      time: n.created_at ?? new Date().toISOString(),
    }));
  } catch { return []; }
}

/** Get news sentiment for an asset (cached 15 minutes) */
export async function getNewsSentiment(asset: string): Promise<NewsSentiment> {
  const cacheKey = `nexus:news:${asset}`;
  try {
    const cached = await redisGet<NewsSentiment>(cacheKey);
    if (cached) return cached;
  } catch {}

  const articles = await fetchAlpacaNews(asset);

  let totalScore = 0;
  let highImpact = false;
  const headlines: NewsSentiment['latestHeadlines'] = [];

  for (const article of articles.slice(0, 10)) {
    const { score, isHighImpact } = scoreSentiment(article.title);
    totalScore += score;
    if (isHighImpact) highImpact = true;

    headlines.push({
      title: article.title.slice(0, 120),
      sentiment: score > 5 ? 'positive' : score < -5 ? 'negative' : 'neutral',
      source: article.source,
      time: article.time,
    });
  }

  const avgScore = articles.length > 0 ? Math.round(totalScore / articles.length) : 0;

  const result: NewsSentiment = {
    asset,
    score: Math.max(-100, Math.min(100, avgScore)),
    articles: articles.length,
    latestHeadlines: headlines.slice(0, 5),
    impactLevel: highImpact ? 'high' : Math.abs(avgScore) > 30 ? 'medium' : 'low',
  };

  redisSet(cacheKey, result, 900).catch(() => {}); // 15 min cache
  return result;
}
