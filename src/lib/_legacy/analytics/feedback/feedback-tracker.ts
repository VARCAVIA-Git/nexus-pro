// ═══════════════════════════════════════════════════════════════
// Feedback Tracker (Phase 3)
//
// Stub: in Phase 4 sarà chiamato dal Strategy V2 quando le mine
// chiudono. In Phase 3 vive solo come libreria + struttura dati.
//
// Schema Redis: nexus:analytic:feedback:{symbol} (JSON)
// {
//   totalTrades, wins, losses,
//   ruleScores: { [ruleId]: { weight, trades, wr } },
//   lastUpdated
// }
//
// Peso = max(0.5, min(2.0, wr_observed / wr_expected))
// dove wr_expected = winRate del mining (dal report.topRules).
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet } from '@/lib/db/redis';
import type { AnalyticReport, FeedbackStats, MinedRule } from '../types';

const KEY_FEEDBACK = (s: string) => `nexus:analytic:feedback:${s}`;
const KEY_REPORT = (s: string) => `nexus:analytic:report:${s}`;

const MIN_WEIGHT = 0.5;
const MAX_WEIGHT = 2.0;

export function clampWeight(w: number): number {
  if (Number.isNaN(w) || !Number.isFinite(w)) return 1.0;
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, w));
}

export function computeWeight(observedWr: number, expectedWr: number): number {
  if (expectedWr <= 0) return 1.0;
  const ratio = observedWr / expectedWr;
  return clampWeight(ratio);
}

export async function loadFeedback(symbol: string): Promise<FeedbackStats> {
  const cached = await redisGet<FeedbackStats>(KEY_FEEDBACK(symbol));
  if (cached) return cached;
  return { totalTrades: 0, wins: 0, losses: 0, ruleScores: {}, lastUpdated: 0 };
}

export async function saveFeedback(symbol: string, stats: FeedbackStats): Promise<void> {
  await redisSet(KEY_FEEDBACK(symbol), { ...stats, lastUpdated: Date.now() });
}

/**
 * Registra l'esito di un trade chiuso. Aggiorna i contatori e ricalcola
 * il peso per la regola che lo aveva originato (se nota).
 *
 * In Phase 4: chiamato da Strategy V2 al close di una Mine.
 * In Phase 3: solo struttura, NESSUNO chiama questa funzione in produzione.
 */
export async function recordTradeOutcome(
  symbol: string,
  ruleId: string,
  pnlPct: number,
  win: boolean,
): Promise<FeedbackStats> {
  void pnlPct;
  const stats = await loadFeedback(symbol);
  stats.totalTrades += 1;
  if (win) stats.wins += 1;
  else stats.losses += 1;

  const ruleScore = stats.ruleScores[ruleId] ?? { weight: 1.0, trades: 0, wr: 0 };
  ruleScore.trades += 1;
  // Streaming WR
  const prevWins = Math.round((ruleScore.wr / 100) * (ruleScore.trades - 1));
  const newWins = prevWins + (win ? 1 : 0);
  ruleScore.wr = Math.round((newWins / ruleScore.trades) * 1000) / 10;

  // Ricalcola peso solo dopo almeno 5 trade per quella regola
  if (ruleScore.trades >= 5) {
    const report = await redisGet<AnalyticReport>(KEY_REPORT(symbol));
    const expected = report?.topRules?.find((r) => r.id === ruleId)?.winRate ?? 50;
    ruleScore.weight = computeWeight(ruleScore.wr, expected);
  }

  stats.ruleScores[ruleId] = ruleScore;
  await saveFeedback(symbol, stats);
  return stats;
}

/**
 * Ritorna una copia del report con topRules riordinate per (confidenceScore × feedbackWeight).
 * Non muta il report originale.
 */
export function applyFeedbackWeights(report: AnalyticReport, feedback?: FeedbackStats): AnalyticReport {
  if (!feedback || Object.keys(feedback.ruleScores).length === 0) return report;
  const rescored: MinedRule[] = (report.topRules ?? []).map((r) => {
    const fbScore = feedback.ruleScores[r.id]?.weight ?? 1.0;
    return { ...r, confidenceScore: Math.round(r.confidenceScore * fbScore) };
  });
  rescored.sort((a, b) => b.confidenceScore - a.confidenceScore);
  return { ...report, topRules: rescored, feedback };
}
