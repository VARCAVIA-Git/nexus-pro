import { describe, it, expect } from 'vitest';
import { analyzeSentiment } from '@/lib/analytics/news/sentiment-analyzer';
import { matchSymbol, synonymsFor } from '@/lib/analytics/news/news-matcher';
import { parseRss } from '@/lib/analytics/news/rss-fetcher';

describe('news sentiment analyzer', () => {
  it('returns 0 for empty text', () => {
    const r = analyzeSentiment('');
    expect(r.score).toBe(0);
  });

  it('detects bullish sentiment', () => {
    const r = analyzeSentiment('Bitcoin surge to record high amid bullish rally and strong demand');
    expect(r.score).toBeGreaterThan(0.3);
    expect(r.matchedPositive.length).toBeGreaterThan(2);
  });

  it('detects bearish sentiment', () => {
    const r = analyzeSentiment('Crypto market crashes amid panic selloff and lawsuit fears');
    expect(r.score).toBeLessThan(-0.3);
    expect(r.matchedNegative.length).toBeGreaterThan(2);
  });

  it('returns near-zero for neutral copy', () => {
    const r = analyzeSentiment('Bitcoin price moves between two levels today');
    expect(Math.abs(r.score)).toBeLessThan(0.5);
  });
});

describe('news symbol matcher', () => {
  it('synonyms include base ticker for BTC/USD', () => {
    const syn = synonymsFor('BTC/USD');
    expect(syn).toContain('bitcoin');
    expect(syn).toContain('btc');
  });

  it('matches a title containing the synonym', () => {
    const r = matchSymbol('BTC/USD', 'Bitcoin breaks new high', 'BTC rally continues');
    expect(r.matched).toBe(true);
    expect(r.matchedKeywords.length).toBeGreaterThan(0);
    expect(r.relevance).toBeGreaterThan(0);
  });

  it('does not match unrelated titles', () => {
    const r = matchSymbol('BTC/USD', 'Apple announces new iPhone features', 'tech news');
    expect(r.matched).toBe(false);
    expect(r.relevance).toBe(0);
  });
});

describe('rss parser', () => {
  it('parses a RSS 2.0 feed and dedups via guid externally', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Bitcoin surges 5% amid rally</title>
        <link>https://example.com/a</link>
        <guid>ex1</guid>
        <pubDate>Mon, 01 Jan 2026 12:00:00 GMT</pubDate>
        <description>Strong demand pushes BTC higher</description>
      </item>
      <item>
        <title>Ethereum hits record</title>
        <link>https://example.com/b</link>
        <guid>ex2</guid>
        <pubDate>Mon, 01 Jan 2026 13:00:00 GMT</pubDate>
        <description>ETH all-time high</description>
      </item>
    </channel></rss>`;
    const items = parseRss(xml, 'test');
    expect(items.length).toBe(2);
    expect(items[0].title).toContain('Bitcoin');
    expect(items[1].title).toContain('Ethereum');
    expect(items[0].guid).toBe('ex1');
  });

  it('parses Atom 1.0 with <entry>', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>urn:1</id>
        <title>SEC filing for AAPL</title>
        <link href="https://example.com/x"/>
        <updated>2026-01-01T00:00:00Z</updated>
        <summary>8-K filing</summary>
      </entry>
    </feed>`;
    const items = parseRss(xml, 'sec');
    expect(items.length).toBe(1);
    expect(items[0].title).toContain('AAPL');
    expect(items[0].link).toContain('example.com');
  });
});
