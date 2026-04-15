// ═══════════════════════════════════════════════════════════════
// Event Impact Analyzer (Phase 3)
//
// Per ogni AI Analytic ready, cerca nello storico (dataset salvato)
// gli eventi macro passati dello stesso tipo e misura il movimento
// ±24h post-evento. Produce EventImpactStat[].
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { redisGet, redisSet, redisSMembers } from '@/lib/db/redis';
import type { AnalyticReport, EventImpactStat, MacroEvent } from '../types';
import { getCachedCalendar } from './event-calendar';

const KEY_REPORT = (s: string) => `nexus:analytic:report:${s}`;
const KEY_DATASET = (s: string) => `nexus:analytic:dataset:${s}`;
const KEY_LIST = 'nexus:analytic:list';

const POST_EVENT_HOURS = 24;

/**
 * Calcola l'impatto degli eventi macro per un singolo symbol.
 * Usa il dataset 1h persistito per misurare il return ±24h post-evento.
 */
export async function analyzeEventImpactForSymbol(symbol: string): Promise<EventImpactStat[]> {
  const events = await getCachedCalendar();
  if (!events || events.length === 0) return [];

  const persisted = await redisGet<Record<string, OHLCV[]>>(KEY_DATASET(symbol));
  const candles = persisted?.['1h'];
  if (!candles || candles.length < 50) return [];

  // Indicizza candele per timestamp (millis epoch all'ora)
  const byHour = new Map<number, OHLCV>();
  for (const c of candles) {
    const t = new Date(c.date).getTime();
    byHour.set(Math.floor(t / 3_600_000) * 3_600_000, c);
  }

  // Raggruppa eventi per nome (rimuovi anno/data dal nome per matching)
  const byName = new Map<string, MacroEvent[]>();
  for (const e of events) {
    const key = e.name;
    const list = byName.get(key) ?? [];
    list.push(e);
    byName.set(key, list);
  }

  const stats: EventImpactStat[] = [];

  for (const [name, eventGroup] of byName.entries()) {
    let upCount = 0;
    let downCount = 0;
    let sumReturn = 0;
    let observations = 0;

    for (const ev of eventGroup) {
      // Skip eventi futuri
      if (ev.scheduledAt > Date.now()) continue;

      const startHour = Math.floor(ev.scheduledAt / 3_600_000) * 3_600_000;
      const endHour = startHour + POST_EVENT_HOURS * 3_600_000;
      const startCandle = byHour.get(startHour);
      const endCandle = byHour.get(endHour);
      if (!startCandle || !endCandle) continue;

      const ret = (endCandle.close - startCandle.close) / startCandle.close;
      sumReturn += ret;
      observations++;
      if (ret > 0) upCount++;
      else if (ret < 0) downCount++;
    }

    if (observations < 2) continue;

    const avg = sumReturn / observations;
    const winRate = (upCount / observations) * 100;
    const direction: EventImpactStat['direction'] =
      upCount > downCount * 1.5 ? 'up' : downCount > upCount * 1.5 ? 'down' : 'mixed';

    stats.push({
      eventName: name,
      direction,
      avgReturn24h: Math.round(avg * 10000) / 100, // in %
      winRate: Math.round(winRate * 10) / 10,
      sampleSize: observations,
    });
  }

  // Filtra per importance: tieni solo eventi che esistono come 'high' nel calendario
  const highImportanceNames = new Set(events.filter((e) => e.importance === 'high').map((e) => e.name));
  const filtered = stats.filter((s) => highImportanceNames.has(s.eventName));
  filtered.sort((a, b) => Math.abs(b.avgReturn24h) - Math.abs(a.avgReturn24h));

  return filtered.slice(0, 20);
}

/**
 * Esegue l'analisi per tutti gli analytic ready, salva su report.eventImpacts.
 */
export async function runEventImpactAnalysisAll(): Promise<{ analyzed: number; errors: string[] }> {
  const symbols = await redisSMembers(KEY_LIST);
  let analyzed = 0;
  const errors: string[] = [];
  for (const symbol of symbols) {
    try {
      const report = await redisGet<AnalyticReport>(KEY_REPORT(symbol));
      if (!report) continue;
      const impacts = await analyzeEventImpactForSymbol(symbol);
      const updated = { ...report, eventImpacts: impacts };
      await redisSet(KEY_REPORT(symbol), updated);
      analyzed++;
    } catch (e) {
      errors.push(`${symbol}: ${(e as Error).message}`);
    }
  }
  return { analyzed, errors };
}
