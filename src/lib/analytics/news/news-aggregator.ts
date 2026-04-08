// ═══════════════════════════════════════════════════════════════
// News Aggregator — orchestrazione fetcher + sentiment + matcher
// fetchNewsForSymbol(symbol) → NewsDigest persistito (TTL 2h).
// Budget hard 30s.
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet } from '@/lib/db/redis';
import type { NewsDigest, NewsItem } from '../types';
import { RSS_SOURCES, sourcesForCategory, type RssSource } from './rss-sources';
import { fetchRssSource, type RawRssItem } from './rss-fetcher';
import { analyzeSentiment } from './sentiment-analyzer';
import { matchSymbol } from './news-matcher';

const KEY_NEWS = (s: string) => `nexus:analytic:news:${s}`;
const TTL_SECONDS = 2 * 60 * 60; // 2h
const BUDGET_MS = 30_000;
const MAX_TOP_ITEMS = 10;

function symbolCategory(symbol: string): 'crypto' | 'stock' {
  if (symbol.includes('/') || symbol === 'BTC' || symbol === 'ETH' || symbol === 'SOL' || symbol === 'AVAX' || symbol === 'LINK' || symbol === 'DOT') {
    return 'crypto';
  }
  return 'stock';
}

function dedupByGuid(items: RawRssItem[]): RawRssItem[] {
  const seen = new Set<string>();
  const out: RawRssItem[] = [];
  for (const it of items) {
    const k = it.guid || it.link || it.title;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export async function fetchNewsForSymbol(symbol: string): Promise<NewsDigest> {
  const start = Date.now();
  const cat = symbolCategory(symbol);
  const sources: RssSource[] = sourcesForCategory(cat);

  const all: RawRssItem[] = [];
  for (const src of sources) {
    if (Date.now() - start > BUDGET_MS) {
      console.warn('[news] budget esaurito, fermo aggregator');
      break;
    }
    const items = await fetchRssSource(src);
    all.push(...items);
  }

  const deduped = dedupByGuid(all);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // ultimi 24h

  const newsItems: NewsItem[] = [];
  for (const it of deduped) {
    if (it.pubDate < cutoff) continue;
    const m = matchSymbol(symbol, it.title, it.description);
    if (!m.matched) continue;
    const sent = analyzeSentiment(`${it.title}. ${it.description}`);
    newsItems.push({
      id: it.guid,
      source: it.sourceId,
      publishedAt: it.pubDate,
      title: it.title,
      url: it.link,
      sentiment: sent.score,
      relevance: m.relevance,
      keywords: m.matchedKeywords,
    });
  }

  // Top items per (rilevanza × ricenza)
  newsItems.sort((a, b) => {
    const ra = a.relevance * 0.7 + (a.publishedAt / Date.now()) * 0.3;
    const rb = b.relevance * 0.7 + (b.publishedAt / Date.now()) * 0.3;
    return rb - ra;
  });
  const topItems = newsItems.slice(0, MAX_TOP_ITEMS);

  const avgSentiment =
    newsItems.length > 0
      ? Math.round((newsItems.reduce((a, n) => a + n.sentiment, 0) / newsItems.length) * 1000) / 1000
      : 0;

  // Delta vs digest precedente
  const previous = await redisGet<NewsDigest>(KEY_NEWS(symbol));
  const sentimentDelta24h = previous ? Math.round((avgSentiment - previous.avgSentiment) * 1000) / 1000 : 0;

  const digest: NewsDigest = {
    symbol,
    window: '24h',
    updatedAt: Date.now(),
    count: newsItems.length,
    avgSentiment,
    topItems,
    sentimentDelta24h,
  };

  await redisSet(KEY_NEWS(symbol), digest, TTL_SECONDS);

  // Update lastNewsFetchAt
  try {
    const stateKey = `nexus:analytic:${symbol}`;
    const state = await redisGet<any>(stateKey);
    if (state) {
      state.lastNewsFetchAt = Date.now();
      await redisSet(stateKey, state);
    }
  } catch {
    /* best effort */
  }

  return digest;
}

export async function getNewsDigest(symbol: string): Promise<NewsDigest | null> {
  return redisGet<NewsDigest>(KEY_NEWS(symbol));
}

// Round-robin cursor per il cron worker
const KEY_NEWS_CURSOR = 'nexus:analytic:news-cursor';
const KEY_LIST = 'nexus:analytic:list';

export async function nextSymbolForNews(): Promise<string | null> {
  const { redisSMembers } = await import('@/lib/db/redis');
  const members = await redisSMembers(KEY_LIST);
  if (!members || members.length === 0) return null;
  const sorted = [...members].sort();
  const cursorRaw = await redisGet<{ idx: number }>(KEY_NEWS_CURSOR);
  const idx = cursorRaw && typeof cursorRaw.idx === 'number' ? cursorRaw.idx : 0;
  const symbol = sorted[idx % sorted.length];
  await redisSet(KEY_NEWS_CURSOR, { idx: (idx + 1) % sorted.length });
  return symbol;
}
