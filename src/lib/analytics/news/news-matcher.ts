// ═══════════════════════════════════════════════════════════════
// News Matcher — match symbol contro titoli/keyword
// Rilevanza = keyword_match_count / parole_titolo (cap a 1.0)
// ═══════════════════════════════════════════════════════════════

const SYMBOL_SYNONYMS: Record<string, string[]> = {
  'BTC/USD': ['bitcoin', 'btc', 'bitcoins'],
  BTC: ['bitcoin', 'btc'],
  'ETH/USD': ['ethereum', 'eth', 'ether'],
  ETH: ['ethereum', 'eth', 'ether'],
  'SOL/USD': ['solana', 'sol'],
  SOL: ['solana', 'sol'],
  'AVAX/USD': ['avalanche', 'avax'],
  AVAX: ['avalanche', 'avax'],
  'LINK/USD': ['chainlink', 'link'],
  LINK: ['chainlink', 'link'],
  'DOT/USD': ['polkadot', 'dot'],
  DOT: ['polkadot', 'dot'],
  AAPL: ['apple', 'aapl', 'iphone'],
  NVDA: ['nvidia', 'nvda'],
  TSLA: ['tesla', 'tsla', 'musk'],
  MSFT: ['microsoft', 'msft'],
  AMZN: ['amazon', 'amzn'],
  META: ['meta', 'facebook', 'instagram'],
};

export function synonymsFor(symbol: string): string[] {
  const direct = SYMBOL_SYNONYMS[symbol];
  if (direct) return direct.map((s) => s.toLowerCase());
  // Fallback: usa il symbol stesso (lowercase)
  const base = symbol.split('/')[0].toLowerCase();
  return [symbol.toLowerCase(), base];
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export interface MatchResult {
  matched: boolean;
  relevance: number; // 0..1
  matchedKeywords: string[];
}

export function matchSymbol(symbol: string, title: string, description: string): MatchResult {
  const synonyms = synonymsFor(symbol);
  const titleTokens = tokenize(title);
  const descTokens = tokenize(description);
  const allTokens = [...titleTokens, ...descTokens];

  const matched = new Set<string>();
  for (const tok of allTokens) {
    if (synonyms.includes(tok)) matched.add(tok);
  }

  if (matched.size === 0) {
    return { matched: false, relevance: 0, matchedKeywords: [] };
  }

  // Rilevanza: pesa di più i match nel titolo
  const titleHits = titleTokens.filter((t) => synonyms.includes(t)).length;
  const titleLen = Math.max(1, titleTokens.length);
  const titleRel = Math.min(1, titleHits / titleLen + 0.2);
  const descRel = matched.size > titleHits ? 0.3 : 0;
  const relevance = Math.min(1, titleRel + descRel);

  return {
    matched: true,
    relevance: Math.round(relevance * 100) / 100,
    matchedKeywords: Array.from(matched),
  };
}
