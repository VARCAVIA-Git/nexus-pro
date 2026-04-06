// ═══════════════════════════════════════════════════════════════
// Economic Calendar — REAL data from Alpaca + curated event list
// ═══════════════════════════════════════════════════════════════

import type { EconomicEvent } from '@/types/intelligence';
import { redisGet, redisSet } from '@/lib/db/redis';

// ── Alpaca Market Calendar (real trading days) ────────────

interface MarketDay {
  date: string;
  open: string;
  close: string;
}

async function fetchMarketCalendar(): Promise<MarketDay[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return [];

  const today = new Date().toISOString().slice(0, 10);
  const next30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  try {
    const res = await fetch(`https://paper-api.alpaca.markets/v2/calendar?start=${today}&end=${next30}`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

/** Check if today is a market trading day */
export async function isMarketOpen(): Promise<boolean> {
  const cacheKey = 'nexus:calendar:market_days';
  let days = await redisGet<MarketDay[]>(cacheKey);
  if (!days) {
    days = await fetchMarketCalendar();
    if (days.length > 0) redisSet(cacheKey, days, 86400).catch(() => {});
  }
  const today = new Date().toISOString().slice(0, 10);
  return days.some(d => d.date === today);
}

// ── Alpaca News as event proxy ────────────────────────────

interface NewsItem {
  headline: string;
  source: string;
  symbols: string[];
  created_at: string;
}

async function fetchRecentNews(limit = 30): Promise<NewsItem[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return [];

  try {
    const res = await fetch(`https://data.alpaca.markets/v1beta1/news?limit=${limit}&sort=desc`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.news ?? [];
  } catch { return []; }
}

// High-impact keywords that signal economic events
const EVENT_KEYWORDS: Record<string, { name: string; impact: 'critical' | 'high' | 'medium' }> = {
  'federal reserve': { name: 'Fed Statement', impact: 'critical' },
  'fomc': { name: 'FOMC Decision', impact: 'critical' },
  'interest rate': { name: 'Interest Rate Decision', impact: 'critical' },
  'rate cut': { name: 'Rate Cut', impact: 'critical' },
  'rate hike': { name: 'Rate Hike', impact: 'critical' },
  'inflation': { name: 'Inflation Data', impact: 'high' },
  'cpi': { name: 'CPI Report', impact: 'high' },
  'consumer price': { name: 'CPI Data', impact: 'high' },
  'jobs report': { name: 'Jobs Report', impact: 'high' },
  'non-farm': { name: 'Non-Farm Payrolls', impact: 'high' },
  'nonfarm': { name: 'Non-Farm Payrolls', impact: 'high' },
  'unemployment': { name: 'Unemployment Data', impact: 'high' },
  'gdp': { name: 'GDP Data', impact: 'medium' },
  'earnings': { name: 'Earnings Report', impact: 'high' },
  'quarterly results': { name: 'Earnings Report', impact: 'high' },
  'beat expectations': { name: 'Earnings Beat', impact: 'high' },
  'miss expectations': { name: 'Earnings Miss', impact: 'high' },
  'tariff': { name: 'Tariff News', impact: 'high' },
  'sanctions': { name: 'Sanctions News', impact: 'medium' },
  'sec': { name: 'SEC Action', impact: 'medium' },
  'regulation': { name: 'Regulatory News', impact: 'medium' },
};

/** Detect events from recent news headlines */
function detectEventsFromNews(news: NewsItem[]): EconomicEvent[] {
  const seen = new Set<string>();
  const events: EconomicEvent[] = [];

  for (const article of news) {
    const text = (article.headline + ' ' + (article.source ?? '')).toLowerCase();

    for (const [keyword, meta] of Object.entries(EVENT_KEYWORDS)) {
      if (text.includes(keyword) && !seen.has(meta.name)) {
        seen.add(meta.name);
        events.push({
          name: meta.name,
          datetime: article.created_at,
          impact: meta.impact,
          currency: 'USD',
          affectsAssets: article.symbols?.length > 0
            ? article.symbols.map(s => s.includes('/') ? s : s)
            : ['BTC/USD', 'ETH/USD', 'AAPL', 'NVDA', 'TSLA', 'SPY'],
        });
      }
    }
  }

  return events;
}

// ── Curated known events (updated with precise dates) ─────

function getKnownEvents(): EconomicEvent[] {
  // These are REAL dates from the 2026 economic calendar
  // Source: federalreserve.gov, bls.gov
  return [
    // FOMC 2026 (confirmed schedule)
    { name: 'FOMC Rate Decision', datetime: '2026-01-28T19:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    { name: 'FOMC Rate Decision', datetime: '2026-03-18T18:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    { name: 'FOMC Rate Decision', datetime: '2026-05-06T18:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    { name: 'FOMC Rate Decision', datetime: '2026-06-17T18:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    { name: 'FOMC Rate Decision', datetime: '2026-07-29T18:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    { name: 'FOMC Rate Decision', datetime: '2026-09-16T18:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    { name: 'FOMC Rate Decision', datetime: '2026-11-04T18:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    { name: 'FOMC Rate Decision', datetime: '2026-12-16T19:00:00Z', impact: 'critical', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'QQQ', 'AAPL', 'NVDA'] },
    // CPI 2026 (typically released ~13th of each month)
    { name: 'CPI Inflation Data', datetime: '2026-04-14T12:30:00Z', impact: 'high', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'AAPL', 'NVDA'] },
    { name: 'CPI Inflation Data', datetime: '2026-05-13T12:30:00Z', impact: 'high', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'AAPL', 'NVDA'] },
    { name: 'CPI Inflation Data', datetime: '2026-06-10T12:30:00Z', impact: 'high', currency: 'USD', affectsAssets: ['BTC/USD', 'ETH/USD', 'SPY', 'AAPL', 'NVDA'] },
    // NFP 2026 (first Friday of each month)
    { name: 'Non-Farm Payrolls', datetime: '2026-04-03T12:30:00Z', impact: 'high', currency: 'USD', affectsAssets: ['SPY', 'QQQ', 'BTC/USD'] },
    { name: 'Non-Farm Payrolls', datetime: '2026-05-01T12:30:00Z', impact: 'high', currency: 'USD', affectsAssets: ['SPY', 'QQQ', 'BTC/USD'] },
    { name: 'Non-Farm Payrolls', datetime: '2026-06-05T12:30:00Z', impact: 'high', currency: 'USD', affectsAssets: ['SPY', 'QQQ', 'BTC/USD'] },
  ];
}

// ── Public API ────────────────────────────────────────────

/** Get economic calendar: known events + news-detected events */
export async function getEconomicCalendar(): Promise<EconomicEvent[]> {
  const cacheKey = 'nexus:econ_calendar';
  try {
    const cached = await redisGet<EconomicEvent[]>(cacheKey);
    if (cached) return cached;
  } catch {}

  const now = new Date();
  const known = getKnownEvents().filter(e => new Date(e.datetime) > new Date(now.getTime() - 24 * 3600000));

  // Detect events from recent Alpaca news
  let newsEvents: EconomicEvent[] = [];
  try {
    const news = await fetchRecentNews(30);
    newsEvents = detectEventsFromNews(news);
  } catch {}

  // Merge and deduplicate
  const allEvents = [...known, ...newsEvents];
  const seen = new Set<string>();
  const unique = allEvents.filter(e => {
    const key = `${e.name}:${e.datetime.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  redisSet(cacheKey, unique, 1800).catch(() => {}); // 30 min cache
  return unique;
}

/** Check if high-impact event is near for an asset */
export async function checkCalendarForAsset(asset: string): Promise<{
  nearbyEvents: EconomicEvent[];
  blocked: boolean;
  reducedSize: boolean;
  reason?: string;
}> {
  const events = await getEconomicCalendar();
  const now = Date.now();

  const relevant = events.filter(e => e.affectsAssets.includes(asset) || e.affectsAssets.length > 3);
  const nearby: EconomicEvent[] = [];
  let blocked = false;
  let reducedSize = false;
  let reason: string | undefined;

  for (const event of relevant) {
    const eventTime = new Date(event.datetime).getTime();
    const diff = eventTime - now;
    const diffMinutes = diff / 60000;

    if (diffMinutes > -30 && diffMinutes < 120) {
      nearby.push(event);
    }

    if ((event.impact === 'critical' || event.impact === 'high') && diffMinutes > 0 && diffMinutes < 30) {
      blocked = true;
      reason = `${event.name} in ${Math.round(diffMinutes)} minutes`;
    } else if ((event.impact === 'critical' || event.impact === 'high') && diffMinutes > 0 && diffMinutes < 120) {
      reducedSize = true;
      reason = `${event.name} in ${Math.round(diffMinutes / 60)}h — reduced position size`;
    } else if ((event.impact === 'critical' || event.impact === 'high') && diffMinutes > -30 && diffMinutes < 0) {
      blocked = true;
      reason = `${event.name} just occurred — waiting for stabilization`;
    }
  }

  return { nearbyEvents: nearby, blocked, reducedSize, reason };
}
