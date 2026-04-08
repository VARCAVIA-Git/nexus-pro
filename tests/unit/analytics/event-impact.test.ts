import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseForexFactoryXml, getUpcomingEvents } from '@/lib/analytics/macro/event-calendar';

describe('ForexFactory XML parser', () => {
  it('parses high-impact event', () => {
    const xml = `<weeklyevents>
      <event>
        <title>Non-Farm Employment Change</title>
        <country>USD</country>
        <date>04-10-2026</date>
        <time>8:30am</time>
        <impact>High</impact>
        <forecast>200K</forecast>
        <previous>180K</previous>
      </event>
    </weeklyevents>`;
    const events = parseForexFactoryXml(xml);
    expect(events.length).toBe(1);
    expect(events[0].name).toContain('Non-Farm');
    expect(events[0].importance).toBe('high');
    expect(events[0].forecast).toBe(200);
    expect(events[0].country).toBe('USD');
  });

  it('parses multiple events with various impacts', () => {
    const xml = `<weeklyevents>
      <event>
        <title>FOMC Statement</title>
        <country>USD</country>
        <date>04-15-2026</date>
        <time>2:00pm</time>
        <impact>High</impact>
      </event>
      <event>
        <title>CB Consumer Confidence</title>
        <country>USD</country>
        <date>04-12-2026</date>
        <time>10:00am</time>
        <impact>Medium</impact>
      </event>
      <event>
        <title>JOLTS Job Openings</title>
        <country>USD</country>
        <date>04-13-2026</date>
        <time>10:00am</time>
        <impact>Low</impact>
      </event>
    </weeklyevents>`;
    const events = parseForexFactoryXml(xml);
    expect(events.length).toBe(3);
    const high = events.filter((e) => e.importance === 'high');
    expect(high.length).toBe(1);
  });
});

describe('getUpcomingEvents filter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns only future high-impact events within window', async () => {
    vi.doMock('@/lib/db/redis', () => ({
      async redisGet() {
        const now = Date.now();
        return [
          { id: 'past', name: 'Old CPI', country: 'USD', scheduledAt: now - 24 * 60 * 60 * 1000, importance: 'high', actual: null, forecast: null, previous: null },
          { id: 'future-high', name: 'NFP', country: 'USD', scheduledAt: now + 6 * 60 * 60 * 1000, importance: 'high', actual: null, forecast: null, previous: null },
          { id: 'future-low', name: 'JOLTS', country: 'USD', scheduledAt: now + 6 * 60 * 60 * 1000, importance: 'low', actual: null, forecast: null, previous: null },
          { id: 'far', name: 'FOMC', country: 'USD', scheduledAt: now + 30 * 24 * 60 * 60 * 1000, importance: 'high', actual: null, forecast: null, previous: null },
        ];
      },
      async redisSet() {},
    }));
    const { getUpcomingEvents } = await import('@/lib/analytics/macro/event-calendar');
    const ev = await getUpcomingEvents(24);
    expect(ev.length).toBe(1);
    expect(ev[0].name).toBe('NFP');
  });
});
