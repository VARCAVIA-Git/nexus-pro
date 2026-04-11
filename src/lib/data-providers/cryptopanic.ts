// ═══════════════════════════════════════════════════════════════
// CryptoPanic — Crypto news aggregator
// Free without key (limited), CRYPTOPANIC_API_KEY for higher quota
// ═══════════════════════════════════════════════════════════════

const CP_BASE = 'https://cryptopanic.com/api/v1';

export interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  votes: { positive: number; negative: number; important: number };
  kind: 'news' | 'media' | 'analysis';
}

const symbolToCurrency: Record<string, string> = {
  'BTC/USD': 'BTC', 'ETH/USD': 'ETH', 'SOL/USD': 'SOL',
  'AVAX/USD': 'AVAX', 'LINK/USD': 'LINK', 'DOT/USD': 'DOT',
};

export async function getCryptoNews(symbol: string, limit = 10): Promise<CryptoPanicPost[]> {
  const currency = symbolToCurrency[symbol];
  if (!currency) return [];

  const key = process.env.CRYPTOPANIC_API_KEY ?? '';
  const params = new URLSearchParams({
    public: 'true',
    currencies: currency,
    kind: 'news',
  });
  if (key) params.set('auth_token', key);

  try {
    const res = await fetch(`${CP_BASE}/posts/?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.results)) return [];

    return data.results.slice(0, limit).map((p: any) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      source: p.source?.title ?? 'Unknown',
      publishedAt: p.published_at,
      votes: {
        positive: p.votes?.positive ?? 0,
        negative: p.votes?.negative ?? 0,
        important: p.votes?.important ?? 0,
      },
      kind: p.kind ?? 'news',
    }));
  } catch { return []; }
}
