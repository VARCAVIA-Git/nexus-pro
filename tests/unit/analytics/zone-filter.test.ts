import { describe, it, expect } from 'vitest';
import { filterZonesByDistance } from '@/lib/analytics/zone-filter';
import { findNearestZones } from '@/lib/analytics/live-observer';
import { selectRelevantEvents } from '@/components/analytics/RelevantEventsCard';
import type { ReactionZone, MacroEvent, EventImpactStat } from '@/lib/analytics/types';

const zone = (priceLevel: number, type: 'support' | 'resistance' = 'support'): ReactionZone => ({
  priceLevel,
  type,
  strength: 80,
  touchCount: 10,
  bounceProbability: 0.7,
  breakoutProbability: 0.3,
  avgBounceMagnitude: 1,
  avgBreakoutMagnitude: 1,
  validUntil: Date.now() + 86400000,
});

describe('filterZonesByDistance — Phase 3.6', () => {
  it('filters zones outside ±15% from current price', () => {
    const zones = [
      zone(70_000), // -5.4% — keep
      zone(80_000, 'resistance'), // +8.1% — keep
      zone(20_000), // -73% — drop (stale historical level)
      zone(90_000, 'resistance'), // +21.6% — drop
      zone(73_000), // -1.3% — keep
    ];
    const filtered = filterZonesByDistance(zones, 74_000, 0.15);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((z) => z.priceLevel).sort((a, b) => a - b)).toEqual([70_000, 73_000, 80_000]);
  });

  it('sorts by absolute distance ascending', () => {
    const zones = [zone(80_000, 'resistance'), zone(70_000), zone(73_500), zone(76_000, 'resistance')];
    const filtered = filterZonesByDistance(zones, 74_000, 0.15);
    // Order: 73500 (-0.7%), 76000 (+2.7%), 70000 (-5.4%), 80000 (+8.1%)
    expect(filtered.map((z) => z.priceLevel)).toEqual([73_500, 76_000, 70_000, 80_000]);
  });

  it('returns all zones when currentPrice is undefined (fallback)', () => {
    const zones = [zone(70_000), zone(80_000), zone(20_000)];
    const filtered = filterZonesByDistance(zones, undefined, 0.15);
    expect(filtered).toHaveLength(3);
    expect(filtered.every((z) => z.distancePct === 0)).toBe(true);
  });

  it('returns empty array when no zones match', () => {
    const zones = [zone(20_000), zone(15_000), zone(120_000)];
    const filtered = filterZonesByDistance(zones, 74_000, 0.15);
    expect(filtered).toHaveLength(0);
  });

  it('handles null/undefined zones input', () => {
    expect(filterZonesByDistance(null, 74_000)).toEqual([]);
    expect(filterZonesByDistance(undefined, 74_000)).toEqual([]);
  });

  it('handles invalid currentPrice gracefully', () => {
    const zones = [zone(70_000), zone(80_000)];
    expect(filterZonesByDistance(zones, 0, 0.15)[0].distancePct).toBe(0);
    expect(filterZonesByDistance(zones, NaN, 0.15)[0].distancePct).toBe(0);
    expect(filterZonesByDistance(zones, -100, 0.15)[0].distancePct).toBe(0);
  });
});

describe('findNearestZones — Phase 3.6 fallback', () => {
  it('returns zones inside range when present', () => {
    const zones = [zone(73_500), zone(76_000, 'resistance'), zone(20_000)];
    const result = findNearestZones(zones, 74_000, 3, 0.03);
    // Within ±3% only 73_500 (-0.67%) and 76_000 (+2.7%)
    expect(result).toHaveLength(2);
  });

  it('falls back to 2 nearest outside range when nothing within ±3%', () => {
    const zones = [zone(50_000), zone(100_000, 'resistance'), zone(20_000)];
    const result = findNearestZones(zones, 74_000, 3, 0.03);
    // None within ±3% → fallback returns 2 closest by absolute distance
    expect(result).toHaveLength(2);
    // 50_000 is closer than 20_000; 100_000 is closer than 20_000 → expect [50k, 100k]
    expect(result.map((z) => z.level).sort((a, b) => a - b)).toEqual([50_000, 100_000]);
  });

  it('returns empty when no zones at all', () => {
    expect(findNearestZones([], 74_000, 3, 0.03)).toEqual([]);
  });
});

describe('selectRelevantEvents — Phase 3.6', () => {
  const now = Date.now();
  const ev = (
    name: string,
    hoursAhead: number,
    importance: MacroEvent['importance'] = 'high',
    country = 'USD',
  ): MacroEvent => ({
    id: `${name}-${hoursAhead}`,
    name,
    country,
    scheduledAt: now + hoursAhead * 3600 * 1000,
    importance,
    actual: null,
    forecast: null,
    previous: null,
  });

  it('matches events with historical impact known for the asset', () => {
    const events = [ev('FOMC Meeting', 24), ev('CPI', 48), ev('NFP', 72)];
    const impacts: EventImpactStat[] = [
      { eventName: 'FOMC Meeting', direction: 'up', avgReturn24h: 1.2, winRate: 70, sampleSize: 5 },
    ];
    const result = selectRelevantEvents(events, impacts, 'BTC/USD');
    expect(result).toHaveLength(1);
    expect(result[0].event.name).toBe('FOMC Meeting');
    expect(result[0].impact?.avgReturn24h).toBe(1.2);
    expect(result[0].isFallback).toBe(false);
  });

  it('falls back to USD high-impact when no impacts match', () => {
    const events = [ev('FOMC Meeting', 24), ev('CPI', 48), ev('Random EUR Event', 12, 'high', 'EUR')];
    const result = selectRelevantEvents(events, [], 'BTC/USD');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.isFallback)).toBe(true);
    expect(result.every((r) => r.event.country === 'USD')).toBe(true);
  });

  it('marks events <2h ahead as imminent', () => {
    const events = [ev('FOMC Meeting', 1)];
    const impacts: EventImpactStat[] = [
      { eventName: 'FOMC Meeting', direction: 'up', avgReturn24h: 1, winRate: 60, sampleSize: 10 },
    ];
    const result = selectRelevantEvents(events, impacts, 'BTC/USD');
    expect(result[0].isImminent).toBe(true);
  });

  it('drops past events and events beyond 7 days', () => {
    const events = [
      ev('Past Event', -24),
      ev('Far Event', 24 * 10),
      ev('Soon Event', 24),
    ];
    const result = selectRelevantEvents(events, [], 'BTC/USD');
    expect(result).toHaveLength(1);
    expect(result[0].event.name).toBe('Soon Event');
  });

  it('caps at 3 results', () => {
    const events = [
      ev('A', 1),
      ev('B', 2),
      ev('C', 3),
      ev('D', 4),
      ev('E', 5),
    ];
    const result = selectRelevantEvents(events, [], 'BTC/USD');
    expect(result).toHaveLength(3);
  });

  it('returns empty when no upcoming events at all', () => {
    expect(selectRelevantEvents([], [], 'BTC/USD')).toEqual([]);
    expect(selectRelevantEvents(null, null, 'BTC/USD')).toEqual([]);
  });
});
