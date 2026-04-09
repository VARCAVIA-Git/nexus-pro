// ═══════════════════════════════════════════════════════════════
// Friendly labels — traduzioni in italiano per enum/sigle tecniche
// ═══════════════════════════════════════════════════════════════

/** Regime di mercato in linguaggio naturale italiano. */
export function regimeLabel(r: string | null | undefined): string {
  if (!r) return 'Sconosciuto';
  switch (r.toUpperCase()) {
    case 'TRENDING_UP':
    case 'TREND_UP':
    case 'TREND':
      return 'In trend rialzista';
    case 'TRENDING_DOWN':
    case 'TREND_DN':
    case 'TREND_DOWN':
      return 'In trend ribassista';
    case 'VOLATILE':
      return 'Volatile';
    case 'RANGING':
    case 'RANGE':
      return 'Laterale (range)';
    case 'BREAKOUT':
      return 'Rottura di livello';
    case 'EXHAUSTION':
      return 'Esaurimento del trend';
    case 'UNKNOWN':
      return 'Sconosciuto';
    default:
      return r;
  }
}

/** Trend direction (UP/DOWN/FLAT/STRONG_UP/STRONG_DOWN). */
export function trendLabel(t: string | null | undefined): string {
  if (!t) return 'sconosciuto';
  switch (t.toUpperCase()) {
    case 'STRONG_UP':
      return 'fortemente rialzista';
    case 'UP':
      return 'rialzista';
    case 'FLAT':
      return 'laterale';
    case 'DOWN':
      return 'ribassista';
    case 'STRONG_DOWN':
      return 'fortemente ribassista';
    default:
      return t.toLowerCase();
  }
}

/** Profit Factor in parole. */
export function pfQualitative(pf: number | null | undefined): string {
  if (pf == null || Number.isNaN(pf)) return 'non disponibile';
  if (pf >= 5) return 'eccezionale';
  if (pf >= 2) return 'ottimo';
  if (pf >= 1.5) return 'buono';
  if (pf >= 1.2) return 'sufficiente';
  if (pf >= 1) return 'in pareggio';
  return 'in perdita';
}

/** Win rate in parole. */
export function wrLabel(wr: number | null | undefined): string {
  if (wr == null || Number.isNaN(wr)) return 'non disponibile';
  if (wr >= 75) return 'molto alto';
  if (wr >= 60) return 'alto';
  if (wr >= 50) return 'sopra la media';
  if (wr >= 40) return 'sotto la media';
  return 'basso';
}

/** Sentiment score (-1..+1) in parole. */
export function sentimentLabel(s: number | null | undefined): string {
  if (s == null || Number.isNaN(s)) return 'neutro';
  if (s >= 0.4) return 'molto positivo';
  if (s >= 0.15) return 'positivo';
  if (s > -0.15) return 'neutro';
  if (s > -0.4) return 'negativo';
  return 'molto negativo';
}

/** Momentum score (-1..+1) in parole. */
export function momentumLabel(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return 'neutro';
  if (m >= 0.5) return 'forte rialzista';
  if (m >= 0.15) return 'rialzista';
  if (m > -0.15) return 'neutro';
  if (m > -0.5) return 'ribassista';
  return 'forte ribassista';
}

/** Direction badge per impatto evento (up/down/mixed). */
export function impactDirectionLabel(d: string | null | undefined): string {
  if (!d) return 'misto';
  switch (d.toLowerCase()) {
    case 'up':
      return 'al rialzo';
    case 'down':
      return 'al ribasso';
    case 'mixed':
    default:
      return 'misto';
  }
}

// ─── Condition translation map ────────────────────────────────

const CONDITION_MAP: Record<string, string> = {
  'RSI<30': 'RSI sotto 30 (ipervenduto)',
  'RSI<40': 'RSI sotto 40 (debole)',
  'RSI>60': 'RSI sopra 60 (forte)',
  'RSI>70': 'RSI sopra 70 (ipercomprato)',
  'BB=BELOW_LOWER': 'prezzo sotto la banda inferiore di Bollinger',
  'BB=AT_LOWER': 'prezzo sulla banda inferiore di Bollinger',
  'BB=LOWER_HALF': 'prezzo nella metà inferiore delle bande',
  'BB=AT_UPPER': 'prezzo sulla banda superiore di Bollinger',
  'BB=ABOVE_UPPER': 'prezzo sopra la banda superiore di Bollinger',
  'MACD=CROSS_UP': 'MACD ha incrociato verso l\'alto',
  'MACD=CROSS_DOWN': 'MACD ha incrociato verso il basso',
  'MACD=ABOVE': 'MACD positivo',
  'MACD=BELOW': 'MACD negativo',
  'TREND_S=UP': 'trend di breve rialzista',
  'TREND_S=DOWN': 'trend di breve ribassista',
  'TREND_M=UP': 'trend di medio rialzista',
  'TREND_M=DOWN': 'trend di medio ribassista',
  'TREND_L=UP': 'trend di lungo rialzista',
  'TREND_L=DOWN': 'trend di lungo ribassista',
  'ADX>25': 'forza del trend alta (ADX>25)',
  'ADX<15': 'mercato debole (ADX<15)',
  'VOL=CLIMAX': 'volume in climax',
  'VOL=HIGH': 'volume elevato',
  'VOL=DRY': 'volume basso',
  'STOCH<20': 'Stocastico in ipervenduto',
  'STOCH>80': 'Stocastico in ipercomprato',
  'REGIME=TREND_UP': 'regime di trend rialzista',
  'REGIME=TREND_DN': 'regime di trend ribassista',
  'REGIME=RANGING': 'mercato laterale',
  'REGIME=VOLATILE': 'mercato volatile',
};

/** Traduce un singolo identifier di condizione in italiano. */
export function conditionLabel(cond: string): string {
  return CONDITION_MAP[cond] ?? cond;
}

/**
 * Traduce una `MinedRule` in una frase italiana naturale.
 * Esempio: "Quando RSI sotto 30 + prezzo sotto banda inferiore + mercato volatile,
 *           BTC è salito del 4.76% nelle 24h successive (osservato 21 volte, vinto 95%)."
 */
export function ruleToItalian(
  rule: {
    conditions: string[];
    direction: 'long' | 'short';
    avgReturn: number;
    occurrences: number;
    winRate: number;
  },
  symbol: string,
): string {
  const conds = (rule.conditions ?? []).map(conditionLabel).join(' + ');
  const verb = rule.direction === 'long' ? 'è salito del' : 'è sceso del';
  const absReturn = Math.abs(rule.avgReturn ?? 0).toFixed(2);
  const wr = Math.round(rule.winRate ?? 0);
  const n = rule.occurrences ?? 0;
  return `Quando ${conds}, ${symbol} ${verb} ${absReturn}% nelle 24h successive (osservato ${n} volte, vinto ${wr}%).`;
}
