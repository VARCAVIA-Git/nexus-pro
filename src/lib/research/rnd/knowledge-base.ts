// ═══════════════════════════════════════════════════════════════
// Knowledge Base — aggregates all R&D findings into actionable entries
// ═══════════════════════════════════════════════════════════════

import type { IndicatorStudy } from './indicator-scanner';
import type { PatternReport } from './pattern-mapper';
import type { EventReport } from './event-analyzer';
import type { LabReport } from './strategy-lab';
import { redisGet, redisSet, KEYS } from '@/lib/db/redis';

export interface KnowledgeEntry {
  id: string;
  asset: string;
  category: 'indicator' | 'pattern' | 'event' | 'strategy' | 'combination';
  finding: string;
  winRate: number;
  avgReturn: number;
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  actionable: boolean;
  recommendation: string;
}

function getConfidence(n: number): KnowledgeEntry['confidence'] {
  if (n >= 100) return 'very_high';
  if (n >= 50) return 'high';
  if (n >= 20) return 'medium';
  return 'low';
}

/** Build knowledge base from all R&D data for one asset */
export function buildAssetKnowledge(
  asset: string,
  indicators: IndicatorStudy[],
  patterns: PatternReport | null,
  events: EventReport | null,
  lab: LabReport | null,
): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  let id = 0;

  // Indicator findings
  for (const study of indicators.filter(s => s.sampleSize >= 10)) {
    entries.push({
      id: `k_${asset}_ind_${id++}`, asset, category: 'indicator',
      finding: `${study.condition} su ${asset} ${study.timeframe} → ${(study.winRate1d * 100).toFixed(0)}% WR 1d (avg ${(study.avgReturn1d * 100).toFixed(2)}%)`,
      winRate: study.winRate1d, avgReturn: study.avgReturn1d,
      sampleSize: study.sampleSize, confidence: getConfidence(study.sampleSize),
      actionable: study.winRate1d > 0.60,
      recommendation: study.winRate1d > 0.65 ? `Usa come entry signal (${(study.winRate1d * 100).toFixed(0)}% WR)` : study.winRate1d < 0.40 ? 'Evita entry con questa condizione' : 'Neutro — non predittivo',
    });
  }

  // Pattern findings
  if (patterns) {
    for (const [name, stats] of Object.entries(patterns.byPattern)) {
      if (stats.occurrences >= 5) {
        entries.push({
          id: `k_${asset}_pat_${id++}`, asset, category: 'pattern',
          finding: `${name} su ${asset} → ${(stats.winRate1d * 100).toFixed(0)}% WR 1d (${stats.occurrences} occorrenze)`,
          winRate: stats.winRate1d, avgReturn: stats.avgReturn1d,
          sampleSize: stats.occurrences, confidence: getConfidence(stats.occurrences),
          actionable: stats.winRate1d > 0.60,
          recommendation: stats.winRate1d > 0.65 ? 'Pattern affidabile per entry' : 'Pattern non affidabile isolatamente',
        });
      }
    }
    // Top combinations
    for (const combo of patterns.topCombinations.slice(0, 5)) {
      entries.push({
        id: `k_${asset}_combo_${id++}`, asset, category: 'combination',
        finding: `${combo.combo} → ${(combo.winRate * 100).toFixed(0)}% WR (${combo.count} occorrenze)`,
        winRate: combo.winRate, avgReturn: combo.avgReturn,
        sampleSize: combo.count, confidence: getConfidence(combo.count),
        actionable: combo.winRate > 0.65 && combo.count >= 5,
        recommendation: combo.winRate > 0.70 ? 'Combinazione potente — prioritizza' : 'Utile come conferma',
      });
    }
  }

  // Event findings
  if (events) {
    for (const [type, stats] of Object.entries(events.byType)) {
      if (stats.count >= 2) {
        entries.push({
          id: `k_${asset}_evt_${id++}`, asset, category: 'event',
          finding: `${asset} dopo ${type} → ${(stats.avgReturn1d * 100).toFixed(2)}% avg 1d (${stats.count} eventi)`,
          winRate: stats.winRate, avgReturn: stats.avgReturn1d,
          sampleSize: stats.count, confidence: getConfidence(stats.count * 5),
          actionable: Math.abs(stats.avgReturn1d) > 0.005,
          recommendation: stats.bestAction,
        });
      }
    }
  }

  // Strategy lab findings
  if (lab?.bestConfig) {
    const bc = lab.bestConfig;
    entries.push({
      id: `k_${asset}_lab_${id++}`, asset, category: 'strategy',
      finding: `Best config: ${bc.strategy} SL:${bc.params.sl}% TP:${bc.params.tp}% → ${bc.result.winRate.toFixed(0)}% WR, Sharpe ${bc.result.sharpe.toFixed(2)}`,
      winRate: bc.result.winRate / 100, avgReturn: bc.result.totalReturn / 100,
      sampleSize: bc.result.trades, confidence: getConfidence(bc.result.trades),
      actionable: true,
      recommendation: `Usa ${bc.strategy} con SL ${bc.params.sl}% e TP ${bc.params.tp}%`,
    });
  }

  entries.sort((a, b) => b.winRate - a.winRate);
  return entries;
}

/** Load full knowledge base */
export async function getKnowledgeBase(): Promise<KnowledgeEntry[]> {
  try {
    const cached = await redisGet<KnowledgeEntry[]>(KEYS.knowledge);
    if (cached) return cached;
  } catch {}
  return [];
}

/** Save knowledge base */
export async function saveKnowledgeBase(entries: KnowledgeEntry[]): Promise<void> {
  await redisSet(KEYS.knowledge, entries, 86400);
}
