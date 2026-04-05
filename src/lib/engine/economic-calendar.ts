// ═══════════════════════════════════════════════════════════════
// Economic Calendar — monitors market-moving events
// Uses hardcoded recurring events + Alpaca calendar API
// ═══════════════════════════════════════════════════════════════

import type { EconomicEvent } from '@/types/intelligence';
import { redisGet, redisSet } from '@/lib/db/redis';

// ── Recurring major events (approximate schedule) ─────────

function getRecurringEvents(now: Date): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const year = now.getFullYear();
  const month = now.getMonth();

  // FOMC meetings (roughly every 6 weeks — Jan, Mar, May, Jun, Jul, Sep, Nov, Dec)
  const fomcMonths = [0, 2, 4, 5, 6, 8, 10, 11];
  for (const m of fomcMonths) {
    if (Math.abs(m - month) <= 1) {
      // Approximate: third Wednesday of the month
      const d = new Date(year, m, 15 + ((3 - new Date(year, m, 15).getDay() + 7) % 7));
      events.push({
        name: 'FOMC Rate Decision', datetime: d.toISOString(),
        impact: 'critical', currency: 'USD',
        affectsAssets: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'],
      });
    }
  }

  // CPI — usually second week of the month
  const cpiDate = new Date(year, month, 12, 8, 30);
  events.push({
    name: 'CPI Inflation Data', datetime: cpiDate.toISOString(),
    impact: 'high', currency: 'USD',
    affectsAssets: ['BTC/USD', 'ETH/USD', 'AAPL', 'NVDA', 'TSLA'],
  });

  // NFP — first Friday of the month
  const firstDay = new Date(year, month, 1);
  const firstFriday = new Date(year, month, 1 + ((5 - firstDay.getDay() + 7) % 7));
  events.push({
    name: 'Non-Farm Payrolls', datetime: new Date(firstFriday.setHours(8, 30)).toISOString(),
    impact: 'high', currency: 'USD',
    affectsAssets: ['BTC/USD', 'AAPL', 'NVDA', 'TSLA', 'MSFT'],
  });

  // GDP — end of month
  events.push({
    name: 'GDP Data', datetime: new Date(year, month, 28, 8, 30).toISOString(),
    impact: 'medium', currency: 'USD',
    affectsAssets: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'],
  });

  return events;
}

// ── Earnings dates (approximate for current quarter) ──────

function getEarningsEvents(now: Date): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const month = now.getMonth();

  // Earnings months: Jan, Apr, Jul, Oct (roughly)
  const isEarningsSeason = [0, 3, 6, 9].includes(month);
  if (isEarningsSeason) {
    const stocks: Array<{ symbol: string; day: number }> = [
      { symbol: 'AAPL', day: 25 }, { symbol: 'MSFT', day: 23 },
      { symbol: 'NVDA', day: 22 }, { symbol: 'AMZN', day: 26 },
      { symbol: 'META', day: 24 }, { symbol: 'TSLA', day: 20 },
    ];
    for (const s of stocks) {
      events.push({
        name: `${s.symbol} Earnings`, datetime: new Date(now.getFullYear(), month, s.day, 16, 0).toISOString(),
        impact: 'high', currency: 'USD', affectsAssets: [s.symbol],
      });
    }
  }

  return events;
}

/** Get upcoming economic events (cached 1 hour) */
export async function getEconomicCalendar(): Promise<EconomicEvent[]> {
  const cacheKey = 'nexus:econ_calendar';
  try {
    const cached = await redisGet<EconomicEvent[]>(cacheKey);
    if (cached) return cached;
  } catch {}

  const now = new Date();
  const events = [...getRecurringEvents(now), ...getEarningsEvents(now)]
    .filter(e => new Date(e.datetime) > new Date(now.getTime() - 24 * 60 * 60 * 1000)) // past 24h to future
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  redisSet(cacheKey, events, 3600).catch(() => {});
  return events;
}

/** Check if any high-impact event is near for an asset */
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
