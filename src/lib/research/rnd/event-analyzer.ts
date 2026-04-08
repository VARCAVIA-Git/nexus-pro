// ═══════════════════════════════════════════════════════════════
// Event Reaction Analyzer — studies how assets react to events
// ═══════════════════════════════════════════════════════════════

import { loadWarehouse } from './data-warehouse';
import { redisSet, KEYS } from '@/lib/db/redis';

const HISTORICAL_EVENTS = [
  { type: 'FOMC', date: '2025-01-29', result: 'hold' },
  { type: 'FOMC', date: '2025-03-19', result: 'hold' },
  { type: 'FOMC', date: '2025-05-07', result: 'cut_25bp' },
  { type: 'FOMC', date: '2025-06-18', result: 'hold' },
  { type: 'FOMC', date: '2025-07-30', result: 'cut_25bp' },
  { type: 'FOMC', date: '2025-09-17', result: 'hold' },
  { type: 'FOMC', date: '2025-11-05', result: 'cut_25bp' },
  { type: 'CPI', date: '2025-01-15', result: 'inline' },
  { type: 'CPI', date: '2025-02-12', result: 'higher' },
  { type: 'CPI', date: '2025-03-12', result: 'lower' },
  { type: 'CPI', date: '2025-04-10', result: 'inline' },
  { type: 'CPI', date: '2025-05-13', result: 'lower' },
  { type: 'CPI', date: '2025-06-11', result: 'inline' },
  { type: 'NFP', date: '2025-01-10', result: 'strong' },
  { type: 'NFP', date: '2025-02-07', result: 'weak' },
  { type: 'NFP', date: '2025-03-07', result: 'strong' },
  { type: 'earnings:AAPL', date: '2025-01-30', result: 'beat' },
  { type: 'earnings:NVDA', date: '2025-02-26', result: 'beat' },
  { type: 'earnings:TSLA', date: '2025-01-29', result: 'miss' },
  { type: 'earnings:MSFT', date: '2025-01-29', result: 'beat' },
  { type: 'earnings:AMZN', date: '2025-02-06', result: 'beat' },
  { type: 'earnings:META', date: '2025-01-29', result: 'beat' },
];

export interface EventReaction {
  eventType: string;
  eventDate: string;
  result: string;
  return1d: number;
  return1w: number;
  direction: 'up' | 'down' | 'flat';
}

export interface EventReport {
  asset: string;
  reactions: EventReaction[];
  byType: Record<string, { avgReturn1d: number; avgReturn1w: number; winRate: number; count: number; bestAction: string }>;
}

export async function analyzeEventReactions(asset: string): Promise<EventReport> {
  const candles = await loadWarehouse(asset, '1d');
  if (candles.length < 30) return { asset, reactions: [], byType: {} };

  const candleMap = new Map<string, number>();
  candles.forEach((c, i) => candleMap.set(c.date.slice(0, 10), i));

  const reactions: EventReaction[] = [];

  for (const event of HISTORICAL_EVENTS) {
    // Only relevant events: general events affect all, earnings affect specific stock
    const isGeneral = !event.type.startsWith('earnings:');
    const isRelevantEarnings = event.type === `earnings:${asset}` || event.type === `earnings:${asset.replace('/USD', '')}`;
    if (!isGeneral && !isRelevantEarnings) continue;

    const idx = candleMap.get(event.date);
    if (idx === undefined || idx >= candles.length - 5) continue;

    const price = candles[idx].close;
    const price1d = candles[Math.min(idx + 1, candles.length - 1)].close;
    const price1w = candles[Math.min(idx + 5, candles.length - 1)].close;
    const ret1d = (price1d - price) / price;
    const ret1w = (price1w - price) / price;

    reactions.push({
      eventType: event.type, eventDate: event.date, result: event.result,
      return1d: ret1d, return1w: ret1w,
      direction: ret1d > 0.005 ? 'up' : ret1d < -0.005 ? 'down' : 'flat',
    });
  }

  // Group by event type
  const byType: EventReport['byType'] = {};
  const groups = new Map<string, EventReaction[]>();
  for (const r of reactions) {
    const key = r.eventType.startsWith('earnings:') ? 'earnings' : r.eventType;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const [type, rs] of groups) {
    if (rs.length === 0) continue;
    const avg1d = rs.reduce((s, r) => s + r.return1d, 0) / rs.length;
    const avg1w = rs.reduce((s, r) => s + r.return1w, 0) / rs.length;
    const winRate = rs.filter(r => r.return1d > 0).length / rs.length;

    let bestAction = 'hold';
    if (avg1d > 0.005) bestAction = 'buy after event';
    else if (avg1d < -0.005 && avg1w > 0) bestAction = 'wait then buy dip';
    else if (avg1d < -0.005) bestAction = 'avoid or short';

    byType[type] = { avgReturn1d: avg1d, avgReturn1w: avg1w, winRate, count: rs.length, bestAction };
  }

  const report: EventReport = { asset, reactions, byType };
  redisSet(KEYS.eventReactions(asset), report, 86400).catch(() => {});
  return report;
}
