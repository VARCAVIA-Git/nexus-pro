// ═══════════════════════════════════════════════════════════════
// Narrative — genera un riassunto in italiano naturale a partire
// dai dati dell'AI Analytic. Pure function, null-safe.
// ═══════════════════════════════════════════════════════════════

import type {
  AnalyticReport,
  LiveContext,
  NewsDigest,
  MacroEvent,
  EventImpactStat,
  MinedRule,
} from './types';
import {
  conditionLabel,
  impactDirectionLabel,
  pfQualitative,
  regimeLabel,
  sentimentLabel,
  trendLabel,
  wrLabel,
} from './labels';

export interface NarrativeInput {
  symbol: string;
  report: AnalyticReport | null | undefined;
  liveContext?: LiveContext | null;
  newsDigest?: NewsDigest | null;
  macroEvents?: MacroEvent[] | null;
  eventImpacts?: EventImpactStat[] | null;
}

const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

function bestRegimeSentence(input: NarrativeInput): string | null {
  const regime = input.liveContext?.regime;
  if (!regime || regime === 'UNKNOWN') return null;

  const phrase: Record<string, string> = {
    TRENDING_UP: 'è in tendenza chiara al rialzo',
    TRENDING_DOWN: 'è in tendenza chiara al ribasso',
    TREND: 'è in tendenza chiara',
    VOLATILE: 'si trova in una fase volatile',
    RANGING: 'si muove in un canale laterale',
    RANGE: 'si muove in un canale laterale',
    BREAKOUT: 'sta rompendo i livelli recenti',
    EXHAUSTION: 'mostra segnali di esaurimento del trend',
  };
  const base = phrase[regime] ?? `è in regime ${regimeLabel(regime).toLowerCase()}`;

  // Aggiungi trend medio se presente nel context
  // (non sempre c'è — il liveContext porta indicators ma non trendMedium)
  return `${input.symbol} ${base}`;
}

function topRuleSentence(input: NarrativeInput): string | null {
  const rules = input.report?.topRules;
  if (!Array.isArray(rules) || rules.length === 0) return null;

  // Top rule = la prima dell'array (Phase 2 le ordina per edgeScore/confidence)
  const top: MinedRule = rules[0];
  if (!top || !Array.isArray(top.conditions) || top.conditions.length === 0) return null;

  const condText = top.conditions.map(conditionLabel).join(' + ');
  const wr = Math.round(top.winRate ?? 0);
  const absReturn = Math.abs(top.avgReturn ?? 0).toFixed(2);
  const verb = (top.direction ?? 'long') === 'long' ? 'è salito del' : 'è sceso del';
  const n = top.occurrences ?? 0;

  return (
    `La regola storicamente più profittevole è "${condText}", osservata ${n} volte ` +
    `con vittoria nel ${wr}% dei casi: in media ${input.symbol} ${verb} ${absReturn}% nelle 24h successive.`
  );
}

function macroEventSentence(input: NarrativeInput): string | null {
  const events = input.macroEvents;
  if (!Array.isArray(events) || events.length === 0) return null;

  const now = Date.now();
  const upcoming = events
    .filter(
      (e) =>
        e &&
        typeof e.scheduledAt === 'number' &&
        e.scheduledAt > now &&
        e.scheduledAt < now + TWO_DAYS_MS &&
        e.importance === 'high',
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  if (upcoming.length === 0) return null;
  const next = upcoming[0];
  const hours = Math.max(1, Math.round((next.scheduledAt - now) / (60 * 60 * 1000)));

  // Cerca un impatto storico associato (per nome evento)
  const impacts = input.eventImpacts ?? [];
  const matched = impacts.find((i) => i?.eventName === next.name);

  let suffix = '';
  if (matched && (matched.sampleSize ?? 0) >= 1) {
    const dir = impactDirectionLabel(matched.direction);
    const ret = (matched.avgReturn24h ?? 0).toFixed(2);
    const sign = (matched.avgReturn24h ?? 0) >= 0 ? '+' : '';
    suffix = ` Storicamente ${input.symbol} reagisce ${dir} (${sign}${ret}% in media 24h, n=${matched.sampleSize}).`;
  }

  return `Attenzione: è in arrivo "${next.name}" tra circa ${hours} ${hours === 1 ? 'ora' : 'ore'}.${suffix}`;
}

function newsSentenceLine(input: NarrativeInput): string | null {
  const digest = input.newsDigest;
  if (!digest || typeof digest.avgSentiment !== 'number') return null;
  const avg = digest.avgSentiment;
  const count = digest.count ?? 0;
  if (count === 0) return null;

  // Solo se chiaramente positivo o negativo
  if (Math.abs(avg) < 0.2) return null;

  const label = sentimentLabel(avg);
  const delta =
    typeof digest.sentimentDelta24h === 'number'
      ? `, in variazione di ${digest.sentimentDelta24h >= 0 ? '+' : ''}${(digest.sentimentDelta24h * 100).toFixed(1)}% rispetto alla finestra precedente`
      : '';
  return `Il sentiment delle ultime 24 ore di notizie su ${input.symbol} è ${label}${delta}.`;
}

function strategyFitSentence(input: NarrativeInput): string | null {
  const fits = input.report?.strategyFit;
  if (!Array.isArray(fits) || fits.length === 0) return null;

  // Trova il fit con PF migliore e trades >= 10 (no low-sample)
  const reliable = fits
    .filter((f) => f && (f.totalTrades ?? 0) >= 10)
    .sort((a, b) => (b.profitFactor ?? 0) - (a.profitFactor ?? 0));
  if (reliable.length === 0) return null;
  const best = reliable[0];
  const pfWord = pfQualitative(best.profitFactor);
  const wrWord = wrLabel(best.winRate);
  return (
    `Sul timeframe ${best.timeframe} la strategia "${best.strategyName}" ha un Profit Factor ${pfWord} ` +
    `(${(best.profitFactor ?? 0).toFixed(2)}), win rate ${wrWord} (${(best.winRate ?? 0).toFixed(0)}%) ` +
    `su ${best.totalTrades} trade.`
  );
}

const DISCLAIMER =
  'Questi sono risultati storici osservati nel passato: non garantiscono i prossimi movimenti.';

/**
 * Genera un paragrafo italiano (4-6 frasi) che riassume lo stato dell'AI
 * Analytic per un asset. Null-safe: se mancano dati, salta la frase
 * relativa e produce comunque un riassunto coerente.
 */
export function generateNarrative(input: NarrativeInput): string {
  const sentences: string[] = [];

  const regime = bestRegimeSentence(input);
  if (regime) sentences.push(regime + '.');

  const topRule = topRuleSentence(input);
  if (topRule) sentences.push(topRule);

  const fit = strategyFitSentence(input);
  if (fit) sentences.push(fit);

  const macro = macroEventSentence(input);
  if (macro) sentences.push(macro);

  const news = newsSentenceLine(input);
  if (news) sentences.push(news);

  // Fallback minimo se tutto era null (asset appena creato, dati assenti)
  if (sentences.length === 0) {
    return `Per ${input.symbol} non ci sono ancora abbastanza dati live o storici per produrre un riassunto. ${DISCLAIMER}`;
  }

  sentences.push(DISCLAIMER);
  return sentences.join(' ');
}
