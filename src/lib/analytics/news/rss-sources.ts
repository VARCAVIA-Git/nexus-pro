// ═══════════════════════════════════════════════════════════════
// RSS sources gratuiti per news finance/crypto
// Tutti free, no API key richiesta.
// ═══════════════════════════════════════════════════════════════

export interface RssSource {
  id: string;
  url: string;
  category: 'crypto' | 'stock' | 'macro';
  weight: number; // peso per scoring rilevanza globale
}

export const RSS_SOURCES: RssSource[] = [
  // Crypto
  { id: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto', weight: 1.0 },
  { id: 'cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto', weight: 0.9 },
  { id: 'decrypt', url: 'https://decrypt.co/feed', category: 'crypto', weight: 0.8 },
  { id: 'bitcoinmagazine', url: 'https://bitcoinmagazine.com/.rss/full/', category: 'crypto', weight: 0.7 },
  // Stocks / macro
  { id: 'marketwatch-top', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', category: 'stock', weight: 1.0 },
  { id: 'marketwatch-rt', url: 'https://feeds.marketwatch.com/marketwatch/realtimeheadlines/', category: 'stock', weight: 0.9 },
  { id: 'seekingalpha-mkt', url: 'https://seekingalpha.com/market_currents.xml', category: 'stock', weight: 0.8 },
  // SEC EDGAR
  { id: 'sec-filings', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=8-K&dateb=&owner=include&count=40&output=atom', category: 'stock', weight: 0.7 },
];

export function sourcesForCategory(cat: 'crypto' | 'stock' | 'macro'): RssSource[] {
  return RSS_SOURCES.filter((s) => s.category === cat || s.category === 'macro');
}
