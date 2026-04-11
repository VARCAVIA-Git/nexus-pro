// ═══════════════════════════════════════════════════════════════
// CoinMarketCap — Crypto metadata, ranking, dominance
// Free tier: 333 calls/day. Key: process.env.COINMARKETCAP_API_KEY
// ═══════════════════════════════════════════════════════════════

const CMC_BASE = 'https://pro-api.coinmarketcap.com/v1';

function getKey(): string | null {
  return process.env.COINMARKETCAP_API_KEY ?? null;
}

const symbolMap: Record<string, string> = {
  'BTC/USD': 'BTC', 'ETH/USD': 'ETH', 'SOL/USD': 'SOL',
  'AVAX/USD': 'AVAX', 'LINK/USD': 'LINK', 'DOT/USD': 'DOT',
};

export interface CmcQuote {
  symbol: string;
  name: string;
  rank: number;
  price: number;
  marketCap: number;
  marketCapDominance: number;
  volume24h: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  ath: number | null;
  athDate: string | null;
  percentChange1h: number;
  percentChange24h: number;
  percentChange7d: number;
  percentChange30d: number;
}

export async function getCmcQuote(symbol: string): Promise<CmcQuote | null> {
  const key = getKey();
  if (!key) return null;
  const ticker = symbolMap[symbol];
  if (!ticker) return null;

  try {
    const res = await fetch(`${CMC_BASE}/cryptocurrency/quotes/latest?symbol=${ticker}&convert=USD`, {
      headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const coin = data?.data?.[ticker];
    if (!coin) return null;
    const quote = coin.quote?.USD;
    return {
      symbol: ticker,
      name: coin.name,
      rank: coin.cmc_rank,
      price: quote?.price ?? 0,
      marketCap: quote?.market_cap ?? 0,
      marketCapDominance: quote?.market_cap_dominance ?? 0,
      volume24h: quote?.volume_24h ?? 0,
      circulatingSupply: coin.circulating_supply ?? 0,
      totalSupply: coin.total_supply ?? 0,
      maxSupply: coin.max_supply ?? null,
      ath: null, // requires separate endpoint
      athDate: null,
      percentChange1h: quote?.percent_change_1h ?? 0,
      percentChange24h: quote?.percent_change_24h ?? 0,
      percentChange7d: quote?.percent_change_7d ?? 0,
      percentChange30d: quote?.percent_change_30d ?? 0,
    };
  } catch { return null; }
}

export interface CmcGlobal {
  totalMarketCap: number;
  total24hVolume: number;
  btcDominance: number;
  ethDominance: number;
  activeCryptocurrencies: number;
}

export async function getCmcGlobalMetrics(): Promise<CmcGlobal | null> {
  const key = getKey();
  if (!key) return null;
  try {
    const res = await fetch(`${CMC_BASE}/global-metrics/quotes/latest`, {
      headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const d = data?.data;
    if (!d) return null;
    return {
      totalMarketCap: d.quote?.USD?.total_market_cap ?? 0,
      total24hVolume: d.quote?.USD?.total_volume_24h ?? 0,
      btcDominance: d.btc_dominance ?? 0,
      ethDominance: d.eth_dominance ?? 0,
      activeCryptocurrencies: d.active_cryptocurrencies ?? 0,
    };
  } catch { return null; }
}
