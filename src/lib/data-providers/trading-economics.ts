// ═══════════════════════════════════════════════════════════════
// Trading Economics — Free guest API for economic calendar
// No key required (guest:guest gives 30-day calendar access)
// https://api.tradingeconomics.com/
// ═══════════════════════════════════════════════════════════════

const TE_BASE = 'https://api.tradingeconomics.com';

export interface TeEvent {
  date: string;
  country: string;
  event: string;
  importance: 1 | 2 | 3; // 1=low, 2=medium, 3=high
  actual: string;
  previous: string;
  forecast: string;
  currency: string;
  unit: string;
  ticker: string;
}

/** Get economic calendar (next ~30 days). Guest tier = 30 day window. */
export async function getEconomicEvents(): Promise<TeEvent[]> {
  try {
    const res = await fetch(`${TE_BASE}/calendar?c=guest:guest&format=json`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    // Filter to FUTURE events only (TE returns past + future mixed)
    const now = Date.now();
    const future = data.filter((e: any) => {
      try {
        return new Date(e.Date).getTime() > now;
      } catch { return false; }
    });

    return future.slice(0, 100).map((e: any) => ({
      date: e.Date,
      country: e.Country,
      event: e.Event,
      importance: (e.Importance ?? 1) as 1 | 2 | 3,
      actual: e.Actual ?? '',
      previous: e.Previous ?? '',
      forecast: e.Forecast ?? e.TEForecast ?? '',
      currency: e.Currency ?? '',
      unit: e.Unit ?? '',
      ticker: e.Ticker ?? '',
    }));
  } catch (e) {
    console.error('[trading-economics] fetch error:', e);
    return [];
  }
}
