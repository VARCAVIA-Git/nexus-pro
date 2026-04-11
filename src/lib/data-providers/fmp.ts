// ═══════════════════════════════════════════════════════════════
// Financial Modeling Prep — Economic calendar, earnings, ratings
// Free tier: 250 calls/day. Key: process.env.FMP_API_KEY
// ═══════════════════════════════════════════════════════════════

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

function getKey(): string | null {
  return process.env.FMP_API_KEY ?? null;
}

export interface FmpEconomicEvent {
  date: string;
  country: string;
  event: string;
  impact: 'High' | 'Medium' | 'Low' | 'None';
  actual: number | null;
  estimate: number | null;
  previous: number | null;
  unit: string;
}

/** Get economic calendar for next N days. */
export async function getEconomicCalendar(daysAhead = 30): Promise<FmpEconomicEvent[]> {
  const key = getKey();
  if (!key) return [];

  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const res = await fetch(`${FMP_BASE}/economic_calendar?from=${from}&to=${to}&apikey=${key}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, 100); // Cap to 100 events
  } catch { return []; }
}

export interface FmpEarning {
  date: string;
  symbol: string;
  eps: number | null;
  epsEstimated: number | null;
  revenue: number | null;
  revenueEstimated: number | null;
  fiscalDateEnding: string;
}

/** Get earnings calendar for a specific stock symbol. */
export async function getEarningsCalendar(symbol: string): Promise<FmpEarning[]> {
  const key = getKey();
  if (!key) return [];
  try {
    const res = await fetch(`${FMP_BASE}/historical/earning_calendar/${symbol}?limit=4&apikey=${key}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export interface FmpAnalystRating {
  symbol: string;
  ratingScore: number;
  rating: string;
  ratingRecommendation: string;
  ratingDetailsDCFScore: number;
  ratingDetailsROEScore: number;
}

/** Get analyst rating for a stock. */
export async function getAnalystRating(symbol: string): Promise<FmpAnalystRating | null> {
  const key = getKey();
  if (!key) return null;
  try {
    const res = await fetch(`${FMP_BASE}/rating/${symbol}?apikey=${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch { return null; }
}
