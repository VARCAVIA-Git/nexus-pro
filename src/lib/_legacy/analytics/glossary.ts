// ═══════════════════════════════════════════════════════════════
// Glossary — definizioni in italiano per metriche e termini
// ═══════════════════════════════════════════════════════════════

export interface GlossaryEntry {
  short: string;
  long: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  PF: {
    short: 'Profit Factor',
    long: 'Rapporto profitti/perdite. >1 è profittevole, >2 ottimo. Un PF di 1.84 significa che per ogni dollaro perso ne sono stati guadagnati 1.84.',
  },
  WR: {
    short: 'Win Rate',
    long: 'Percentuale di trade vincenti sul totale. Da sola non basta: serve anche il PF per capire se i vincenti pagano i perdenti.',
  },
  Sharpe: {
    short: 'Sharpe Ratio',
    long: 'Rendimento aggiustato per il rischio. >1 buono, >2 ottimo, >3 eccezionale. Misura quanto rendimento ottieni per unità di rischio assunto.',
  },
  MaxDD: {
    short: 'Max Drawdown',
    long: "La massima perdita percentuale dal picco più alto. Indica quanto può far male il peggior momento della strategia.",
  },
  WilsonLB: {
    short: 'Wilson Lower Bound',
    long: 'Stima pessimistica del win rate che tiene conto del numero di campioni. Se il Wilson LB è alto, il risultato è statisticamente robusto anche con pochi campioni.',
  },
  Regime: {
    short: 'Regime di mercato',
    long: 'Lo stato corrente del prezzo: TREND (direzione chiara), VOLATILE (nervoso, movimenti ampi), RANGE (laterale, dentro un canale), BREAKOUT (rottura di un livello importante).',
  },
  Zone: {
    short: 'Reaction Zone',
    long: 'Livello storico dove il prezzo ha reagito in passato. Può essere un supporto (rimbalzo dal basso), una resistenza (rifiuto dall\'alto) o una zona di rottura.',
  },
  TREND_M: {
    short: 'Trend medio',
    long: 'Direzione del prezzo sul medio periodo (20-50 candele). UP = rialzo, DOWN = ribasso, FLAT = laterale.',
  },
  Trades: {
    short: 'Trades',
    long: 'Numero di trade chiusi (vincenti + perdenti). Un campione di almeno 30 trade è considerato statisticamente significativo.',
  },
  Confidence: {
    short: 'Confidence',
    long: 'Punteggio di affidabilità della regola (0-100). Combina win rate, numero di campioni e dimensione del profitto medio.',
  },
  Momentum: {
    short: 'Momentum',
    long: 'Forza del movimento attuale del prezzo (-1 a +1). Combina RSI, MACD e posizione vs media mobile. Positivo = pressione rialzista, negativo = pressione ribassista.',
  },
  Volatility: {
    short: 'Volatility Percentile',
    long: 'Quanto è volatile il prezzo ora rispetto allo storico (0-100). 80 = molto più volatile del normale, 20 = molto più calmo del normale.',
  },
  Sentiment: {
    short: 'News Sentiment',
    long: 'Tono medio delle ultime 24h di notizie (-1 a +1). Calcolato confrontando parole positive e negative nei titoli RSS. Non è opinione, è statistica testuale.',
  },
};

export function explain(term: keyof typeof GLOSSARY | string): GlossaryEntry | null {
  return GLOSSARY[term as keyof typeof GLOSSARY] ?? null;
}
