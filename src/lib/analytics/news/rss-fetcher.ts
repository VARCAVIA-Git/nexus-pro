// ═══════════════════════════════════════════════════════════════
// RSS Fetcher — parser regex-based per RSS 2.0 e Atom 1.0
//
// Niente dipendenze npm: il formato RSS è semplice e l'XML è
// permissivo. Estraiamo solo i campi che ci servono (title, link,
// pubDate, guid, description).
// ═══════════════════════════════════════════════════════════════

import type { RssSource } from './rss-sources';

export interface RawRssItem {
  guid: string;
  title: string;
  link: string;
  pubDate: number; // timestamp ms
  description: string;
  sourceId: string;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ITEMS_PER_FEED = 50;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
}

function stripTags(s: string): string {
  return decodeEntities(s).replace(/<[^>]*>/g, '').trim();
}

function pickTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? stripTags(m[1]) : '';
}

function pickAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

function parseDate(raw: string): number {
  if (!raw) return Date.now();
  const t = Date.parse(raw);
  return Number.isNaN(t) ? Date.now() : t;
}

/**
 * Parse generico: tenta prima i tag <item> (RSS 2.0), poi <entry> (Atom 1.0).
 */
export function parseRss(xml: string, sourceId: string): RawRssItem[] {
  const out: RawRssItem[] = [];

  // RSS 2.0: <item>...</item>
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const inner = m[1];
    const title = pickTag(inner, 'title');
    if (!title) continue;
    const link = pickTag(inner, 'link') || pickAttr(inner, 'link', 'href');
    const guid = pickTag(inner, 'guid') || link || title;
    const pubDate = parseDate(pickTag(inner, 'pubDate') || pickTag(inner, 'date'));
    const description = pickTag(inner, 'description') || pickTag(inner, 'summary');
    out.push({ guid, title, link, pubDate, description, sourceId });
    if (out.length >= MAX_ITEMS_PER_FEED) return out;
  }
  if (out.length > 0) return out;

  // Atom 1.0: <entry>...</entry>
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((m = entryRegex.exec(xml)) !== null) {
    const inner = m[1];
    const title = pickTag(inner, 'title');
    if (!title) continue;
    const link = pickAttr(inner, 'link', 'href') || pickTag(inner, 'link');
    const guid = pickTag(inner, 'id') || link || title;
    const pubDate = parseDate(pickTag(inner, 'updated') || pickTag(inner, 'published'));
    const description = pickTag(inner, 'summary') || pickTag(inner, 'content');
    out.push({ guid, title, link, pubDate, description, sourceId });
    if (out.length >= MAX_ITEMS_PER_FEED) return out;
  }

  return out;
}

export async function fetchRssSource(source: RssSource): Promise<RawRssItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'NexusPro/1.0 (+https://nexus.local)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[rss] ${source.id} HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    return parseRss(text, source.id);
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[rss] ${source.id} error: ${(e as Error).message}`);
    return [];
  }
}
