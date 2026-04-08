// ═══════════════════════════════════════════════════════════════
// News Sentiment Engine — enhanced keyword analysis via Alpaca News API
// ═══════════════════════════════════════════════════════════════

import type { NewsSentiment } from '@/types/intelligence';
import { redisGet, redisSet } from '@/lib/db/redis';

const ALPACA_NEWS_URL = 'https://data.alpaca.markets/v1beta1/news';

const BULLISH = [
  'surge', 'soar', 'rally', 'breakout', 'bullish', 'upgrade', 'beat', 'record high',
  'strong earnings', 'revenue growth', 'buy rating', 'outperform', 'expansion',
  'partnership', 'approval', 'launch', 'innovation', 'adoption', 'institutional',
  'all-time high', 'profit', 'revenue beat', 'growth', 'positive', 'upside',
];

const BEARISH = [
  'crash', 'plunge', 'selloff', 'bearish', 'downgrade', 'miss', 'record low',
  'weak earnings', 'revenue decline', 'sell rating', 'underperform', 'contraction',
  'lawsuit', 'rejection', 'delay', 'hack', 'exploit', 'regulation', 'ban', 'sec',
  'bankruptcy', 'layoff', 'investigation', 'fine', 'recall', 'decline', 'warning', 'fraud',
];

const HIGH_IMPACT = [
  'fed', 'fomc', 'interest rate', 'inflation', 'cpi', 'nfp', 'unemployment',
  'gdp', 'recession', 'tariff', 'sanctions', 'war', 'default', 'bankruptcy',
  'jobs report', 'earnings', 'regulation',
];

function scoreArticle(text: string): { bull: number; bear: number; highImpact: boolean } {
  const lower = text.toLowerCase();
  let bull = 0, bear = 0, highImpact = false;

  for (const kw of BULLISH) { if (lower.includes(kw)) bull++; }
  for (const kw of BEARISH) { if (lower.includes(kw)) bear++; }
  for (const kw of HIGH_IMPACT) { if (lower.includes(kw)) highImpact = true; }

  return { bull, bear, highImpact };
}

async function fetchAlpacaNews(asset: string, limit = 20): Promise<Array<{ headline: string; summary: string; source: string; time: string; symbols: string[] }>> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return [];

  // For crypto: BTCUSD format; for stocks: AAPL
  const alpacaSymbol = asset.includes('/') ? asset.replace('/', '') : asset;

  try {
    const res = await fetch(`${ALPACA_NEWS_URL}?symbols=${alpacaSymbol}&limit=${limit}&sort=desc`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.news ?? []).map((n: any) => ({
      headline: n.headline ?? '',
      summary: n.summary ?? '',
      source: n.source ?? 'unknown',
      time: n.created_at ?? new Date().toISOString(),
      symbols: n.symbols ?? [],
    }));
  } catch { return []; }
}

/** Get news sentiment for an asset (cached 10 minutes) */
export async function getNewsSentiment(asset: string): Promise<NewsSentiment> {
  const cacheKey = `nexus:news:${asset}`;
  try {
    const cached = await redisGet<NewsSentiment>(cacheKey);
    if (cached) return cached;
  } catch {}

  const articles = await fetchAlpacaNews(asset, 20);

  let bullCount = 0;
  let bearCount = 0;
  let highImpact = false;
  const headlines: NewsSentiment['latestHeadlines'] = [];

  for (const article of articles) {
    const text = article.headline + ' ' + article.summary;
    const { bull, bear, highImpact: hi } = scoreArticle(text);
    if (hi) highImpact = true;

    if (bull > bear) bullCount++;
    else if (bear > bull) bearCount++;

    const sentiment = bull > bear ? 'positive' : bear > bull ? 'negative' : 'neutral';
    headlines.push({
      title: article.headline.slice(0, 120),
      sentiment,
      source: article.source,
      time: article.time,
    });
  }

  // Score: 50 = neutral, >50 = bullish, <50 = bearish
  // Range: ~10 to ~90 based on bull/bear ratio
  const total = bullCount + bearCount;
  const rawScore = total > 0 ? 50 + ((bullCount - bearCount) / total) * 40 : 0;
  const score = total > 0 ? Math.max(-100, Math.min(100, Math.round((rawScore - 50) * 2.5))) : 0;

  const result: NewsSentiment = {
    asset,
    score,
    articles: articles.length,
    latestHeadlines: headlines.slice(0, 5),
    impactLevel: highImpact ? 'high' : Math.abs(score) > 30 ? 'medium' : 'low',
  };

  redisSet(cacheKey, result, 600).catch(() => {}); // 10 min cache
  return result;
}
