// ═══════════════════════════════════════════════════════════════
// Mappa: per ogni macro event noto, indica se "actual > forecast"
// è una sorpresa positiva (good) o negativa (bad) per l'asset.
//
// La logica di base è:
// - Crescita / occupazione / consumi: more = good (verde se actual > fcst)
// - Inflazione / disoccupazione: more = bad (rosso se actual > fcst)
//
// Match case-insensitive con `includes` su substring del nome.
// Se l'evento non matcha, la card mostra il delta senza colorazione.
// ═══════════════════════════════════════════════════════════════

export type EventDirection = 'higher_better' | 'lower_better';

interface DirectionRule {
  pattern: string; // substring lowercase
  direction: EventDirection;
}

const RULES: DirectionRule[] = [
  // Inflazione → lower is better
  { pattern: 'cpi', direction: 'lower_better' },
  { pattern: 'ppi', direction: 'lower_better' },
  { pattern: 'pce', direction: 'lower_better' },
  { pattern: 'inflation', direction: 'lower_better' },
  { pattern: 'price index', direction: 'lower_better' },
  // Disoccupazione → lower is better
  { pattern: 'unemployment', direction: 'lower_better' },
  { pattern: 'jobless claims', direction: 'lower_better' },
  // Lavoro creato / occupazione → higher is better
  { pattern: 'non-farm', direction: 'higher_better' },
  { pattern: 'nfp', direction: 'higher_better' },
  { pattern: 'employment change', direction: 'higher_better' },
  { pattern: 'payrolls', direction: 'higher_better' },
  { pattern: 'jolts', direction: 'higher_better' },
  { pattern: 'job openings', direction: 'higher_better' },
  // PIL / produzione / vendite → higher is better
  { pattern: 'gdp', direction: 'higher_better' },
  { pattern: 'industrial production', direction: 'higher_better' },
  { pattern: 'retail sales', direction: 'higher_better' },
  { pattern: 'durable goods', direction: 'higher_better' },
  { pattern: 'manufacturing pmi', direction: 'higher_better' },
  { pattern: 'services pmi', direction: 'higher_better' },
  { pattern: 'consumer confidence', direction: 'higher_better' },
  { pattern: 'consumer sentiment', direction: 'higher_better' },
  { pattern: 'business confidence', direction: 'higher_better' },
];

export function eventDirection(eventName: string | null | undefined): EventDirection | null {
  if (!eventName) return null;
  const name = eventName.toLowerCase();
  for (const r of RULES) {
    if (name.includes(r.pattern)) return r.direction;
  }
  return null;
}

/**
 * Calcola il colore del badge "sorpresa" dato actual e forecast.
 * - 'green' / 'red' se l'evento è mappato e c'è abbastanza dato.
 * - 'neutral' se manca la direzione semantica o uno dei due valori.
 */
export function surpriseColor(
  eventName: string,
  actual: number | null | undefined,
  forecast: number | null | undefined,
): 'green' | 'red' | 'neutral' {
  if (actual == null || forecast == null) return 'neutral';
  const dir = eventDirection(eventName);
  if (!dir) return 'neutral';
  const delta = actual - forecast;
  if (delta === 0) return 'neutral';
  const isPositive = delta > 0;
  if (dir === 'higher_better') return isPositive ? 'green' : 'red';
  return isPositive ? 'red' : 'green';
}
