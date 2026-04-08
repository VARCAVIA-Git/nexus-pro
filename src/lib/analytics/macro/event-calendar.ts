// ═══════════════════════════════════════════════════════════════
// Macro Event Calendar — fetcher gratuito da ForexFactory XML
//
// Source: https://nfs.faireconomy.media/ff_calendar_thisweek.xml
// Parse manuale (regex), nessuna dipendenza npm.
// TTL Redis: 7 giorni.
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet } from '@/lib/db/redis';
import type { MacroEvent } from '../types';

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';
const KEY_CALENDAR = 'nexus:macro:calendar';
const TTL_SECONDS = 7 * 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 15_000;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}

function pickTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function parseFloatOrNull(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const v = parseFloat(cleaned);
  return Number.isNaN(v) ? null : v;
}

function mapImpact(impact: string): MacroEvent['importance'] {
  const lower = impact.toLowerCase();
  if (lower.includes('high')) return 'high';
  if (lower.includes('medium')) return 'medium';
  return 'low';
}

export function parseForexFactoryXml(xml: string): MacroEvent[] {
  const out: MacroEvent[] = [];
  const eventRegex = /<event[^>]*>([\s\S]*?)<\/event>/gi;
  let m: RegExpExecArray | null;
  while ((m = eventRegex.exec(xml)) !== null) {
    const inner = m[1];
    const title = pickTag(inner, 'title');
    if (!title) continue;
    const country = pickTag(inner, 'country');
    const date = pickTag(inner, 'date'); // MM-DD-YYYY
    const time = pickTag(inner, 'time'); // h:mma o "All Day"
    const impact = pickTag(inner, 'impact');
    const forecast = parseFloatOrNull(pickTag(inner, 'forecast'));
    const previous = parseFloatOrNull(pickTag(inner, 'previous'));
    const actual = parseFloatOrNull(pickTag(inner, 'actual'));

    let scheduledAt = Date.now();
    if (date) {
      const [mm, dd, yyyy] = date.split('-');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      let isoTime = '00:00:00';
      if (time && /\d/.test(time)) {
        const tm = time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (tm) {
          let h = parseInt(tm[1], 10);
          const min = tm[2];
          const ampm = (tm[3] ?? '').toLowerCase();
          if (ampm === 'pm' && h < 12) h += 12;
          if (ampm === 'am' && h === 12) h = 0;
          isoTime = `${String(h).padStart(2, '0')}:${min}:00`;
        }
      }
      const t = Date.parse(`${isoDate}T${isoTime}-05:00`); // ForexFactory usa EST
      if (!Number.isNaN(t)) scheduledAt = t;
    }

    const id = `${country}|${title}|${scheduledAt}`;
    out.push({
      id,
      name: title,
      country,
      scheduledAt,
      importance: mapImpact(impact),
      actual,
      forecast,
      previous,
    });
  }
  return out;
}

export async function fetchMacroCalendar(): Promise<MacroEvent[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FF_URL, {
      headers: { 'User-Agent': 'NexusPro/1.0' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[macro] ForexFactory HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const events = parseForexFactoryXml(xml);
    await redisSet(KEY_CALENDAR, events, TTL_SECONDS);
    return events;
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[macro] fetch error: ${(e as Error).message}`);
    return [];
  }
}

export async function getCachedCalendar(): Promise<MacroEvent[]> {
  const cached = await redisGet<MacroEvent[]>(KEY_CALENDAR);
  return Array.isArray(cached) ? cached : [];
}

/** Eventi high-impact nelle prossime N ore (default 24h). */
export async function getUpcomingEvents(hoursAhead = 24): Promise<MacroEvent[]> {
  const all = await getCachedCalendar();
  const now = Date.now();
  const limit = now + hoursAhead * 60 * 60 * 1000;
  return all
    .filter((e) => e.importance === 'high' && e.scheduledAt >= now && e.scheduledAt <= limit)
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
}
