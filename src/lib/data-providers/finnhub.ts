// ═══════════════════════════════════════════════════════════════
// Finnhub — Stock fundamentals, earnings, news, analyst recommendations
// Free tier: 60 calls/min. Key: process.env.FINNHUB_API_KEY
// ═══════════════════════════════════════════════════════════════

const FH_BASE = 'https://finnhub.io/api/v1';

function getKey(): string | null {
  return process.env.FINNHUB_API_KEY ?? null;
}

export interface FhCompanyProfile {
  name: string;
  ticker: string;
  exchange: string;
  finnhubIndustry: string;
  marketCapitalization: number;
  shareOutstanding: number;
  ipo: string;
  weburl: string;
  logo: string;
}

export async function getCompanyProfile(symbol: string): Promise<FhCompanyProfile | null> {
  const key = getKey();
  if (!key) return null;
  try {
    const res = await fetch(`${FH_BASE}/stock/profile2?symbol=${symbol}&token=${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.name ? data : null;
  } catch { return null; }
}

export interface FhRecommendation {
  symbol: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

export async function getRecommendation(symbol: string): Promise<FhRecommendation | null> {
  const key = getKey();
  if (!key) return null;
  try {
    const res = await fetch(`${FH_BASE}/stock/recommendation?symbol=${symbol}&token=${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch { return null; }
}

export interface FhNewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
  category: string;
  summary: string;
  image: string;
}

export async function getCompanyNews(symbol: string, limit = 10): Promise<FhNewsItem[]> {
  const key = getKey();
  if (!key) return [];
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const res = await fetch(`${FH_BASE}/company-news?symbol=${symbol}&from=${weekAgo}&to=${today}&token=${key}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.slice(0, limit) : [];
  } catch { return []; }
}

export interface FhBasicFinancials {
  metric: {
    '52WeekHigh'?: number;
    '52WeekLow'?: number;
    peNormalizedAnnual?: number;
    peTTM?: number;
    epsTTM?: number;
    dividendYieldIndicatedAnnual?: number;
    beta?: number;
    roeTTM?: number;
    revenueGrowthTTMYoy?: number;
  };
}

export async function getBasicFinancials(symbol: string): Promise<FhBasicFinancials | null> {
  const key = getKey();
  if (!key) return null;
  try {
    const res = await fetch(`${FH_BASE}/stock/metric?symbol=${symbol}&metric=all&token=${key}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
