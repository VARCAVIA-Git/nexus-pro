// ═══════════════════════════════════════════════════════════════
// Pattern History Mapper — maps every candlestick pattern occurrence
// and what happened after, in what context
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { detectPatterns } from '../patterns';
import { computeIndicators, detectRegime } from '../indicators';
import { loadWarehouse } from './data-warehouse';
import { redisSet, KEYS } from '@/lib/db/redis';

export interface PatternOccurrence {
  pattern: string;
  date: string;
  price: number;
  return1d: number;
  return1w: number;
  regime: string;
  volume: 'low' | 'normal' | 'high';
}

export interface PatternReport {
  asset: string;
  byPattern: Record<string, { occurrences: number; avgReturn1d: number; winRate1d: number; avgReturn1w: number; winRate1w: number }>;
  byPatternAndRegime: Record<string, Record<string, { winRate: number; count: number }>>;
  topCombinations: Array<{ combo: string; winRate: number; count: number; avgReturn: number }>;
}

export async function mapPatterns(asset: string, tf: string = '1d'): Promise<PatternReport> {
  const candles = await loadWarehouse(asset, tf);
  if (candles.length < 60) return { asset, byPattern: {}, byPatternAndRegime: {}, topCombinations: [] };

  const indicators = computeIndicators(candles);
  const lookAhead = tf === '1d' ? 5 : tf === '4h' ? 30 : 24;

  const occurrences: PatternOccurrence[] = [];

  for (let i = 10; i < candles.length - lookAhead; i++) {
    const patterns = detectPatterns(candles.slice(0, i + 1)).filter(p => p.index === i);
    if (patterns.length === 0) continue;

    const close = candles[i].close;
    const future = candles[Math.min(i + (tf === '1d' ? 1 : 6), candles.length - 1)].close;
    const futureW = candles[Math.min(i + lookAhead, candles.length - 1)].close;
    const regime = detectRegime(indicators, i);

    // Volume classification
    const avgVol = indicators.volume.avg20[i] || 1;
    const volRatio = candles[i].volume / avgVol;
    const volume: 'low' | 'normal' | 'high' = volRatio > 1.5 ? 'high' : volRatio < 0.5 ? 'low' : 'normal';

    for (const p of patterns) {
      occurrences.push({
        pattern: p.type, date: candles[i].date, price: close,
        return1d: (future - close) / close,
        return1w: (futureW - close) / close,
        regime, volume,
      });
    }
  }

  // Aggregate by pattern
  const byPattern: PatternReport['byPattern'] = {};
  const patternGroups = new Map<string, PatternOccurrence[]>();

  for (const o of occurrences) {
    if (!patternGroups.has(o.pattern)) patternGroups.set(o.pattern, []);
    patternGroups.get(o.pattern)!.push(o);
  }

  for (const [name, occ] of patternGroups) {
    if (occ.length < 3) continue;
    byPattern[name] = {
      occurrences: occ.length,
      avgReturn1d: occ.reduce((s, o) => s + o.return1d, 0) / occ.length,
      winRate1d: occ.filter(o => o.return1d > 0).length / occ.length,
      avgReturn1w: occ.reduce((s, o) => s + o.return1w, 0) / occ.length,
      winRate1w: occ.filter(o => o.return1w > 0).length / occ.length,
    };
  }

  // Cross-analysis: pattern × regime
  const byPatternAndRegime: PatternReport['byPatternAndRegime'] = {};
  for (const o of occurrences) {
    const key = o.pattern;
    if (!byPatternAndRegime[key]) byPatternAndRegime[key] = {};
    if (!byPatternAndRegime[key][o.regime]) byPatternAndRegime[key][o.regime] = { winRate: 0, count: 0 };
    byPatternAndRegime[key][o.regime].count++;
  }
  // Calculate win rates
  for (const [pattern, regimes] of Object.entries(byPatternAndRegime)) {
    for (const [regime, stats] of Object.entries(regimes)) {
      const occ = occurrences.filter(o => o.pattern === pattern && o.regime === regime);
      stats.winRate = occ.length > 0 ? occ.filter(o => o.return1d > 0).length / occ.length : 0;
    }
  }

  // Top combinations
  const combos: PatternReport['topCombinations'] = [];
  for (const o of occurrences) {
    const combo = `${o.pattern}+${o.regime}+${o.volume}vol`;
    const existing = combos.find(c => c.combo === combo);
    if (existing) { existing.count++; existing.avgReturn += o.return1d; }
    else combos.push({ combo, winRate: 0, count: 1, avgReturn: o.return1d });
  }
  for (const c of combos) {
    c.avgReturn /= c.count;
    const matchingOcc = occurrences.filter(o => `${o.pattern}+${o.regime}+${o.volume}vol` === c.combo);
    c.winRate = matchingOcc.filter(o => o.return1d > 0).length / matchingOcc.length;
  }
  combos.sort((a, b) => b.winRate - a.winRate);

  const report: PatternReport = { asset, byPattern, byPatternAndRegime, topCombinations: combos.filter(c => c.count >= 3).slice(0, 15) };
  redisSet(KEYS.patternMap(asset), report, 86400).catch(() => {});
  return report;
}
