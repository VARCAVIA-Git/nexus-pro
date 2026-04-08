// ═══════════════════════════════════════════════════════════════
// Deep Mapping — Pattern Miner
// Tests all 2-condition and 3-condition combos to find profitable rules
// ═══════════════════════════════════════════════════════════════

import type { CandleContext } from './candle-analyzer';

export interface MinedRule {
  id: string;
  conditions: string[];
  occurrences: number;
  winRate: number;       // raw % of times the next 24h return was positive
  wilsonLB: number;      // Wilson 95% LB on wins (raw, for backward compat)
  wilson: number;        // Direction-aware Wilson confidence (high = strong signal)
                         // BUY: Wilson LB on wins
                         // SELL: Wilson LB on losses (= confidence price will go DOWN)
  avgReturn: number;     // % avg return at 24h
  direction: 'BUY' | 'SELL';
  edgeScore: number;     // wilson × |avgReturn| × sqrt(occurrences)
}

/**
 * Wilson score interval lower bound (95% confidence).
 * Standard fix for selection bias: penalizes extreme WR on small samples.
 * Example: 100% WR with 10 samples → Wilson LB ≈ 72%
 *          100% WR with 30 samples → Wilson LB ≈ 89%
 *          100% WR with 100 samples → Wilson LB ≈ 96%
 */
function wilsonLowerBound(wins: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

interface Condition {
  id: string;
  test: (c: CandleContext) => boolean;
}

// 30 conditions covering RSI, BB, MACD, trends, ADX, volume, stoch, regimes
const CONDITIONS: Condition[] = [
  // RSI zones
  { id: 'RSI<30',           test: c => c.rsi14 < 30 },
  { id: 'RSI<40',           test: c => c.rsi14 < 40 },
  { id: 'RSI>60',           test: c => c.rsi14 > 60 },
  { id: 'RSI>70',           test: c => c.rsi14 > 70 },
  // BB positions
  { id: 'BB=BELOW_LOWER',   test: c => c.bbPosition === 'BELOW_LOWER' },
  { id: 'BB=AT_LOWER',      test: c => c.bbPosition === 'AT_LOWER' },
  { id: 'BB=LOWER_HALF',    test: c => c.bbPosition === 'LOWER_HALF' },
  { id: 'BB=AT_UPPER',      test: c => c.bbPosition === 'AT_UPPER' },
  { id: 'BB=ABOVE_UPPER',   test: c => c.bbPosition === 'ABOVE_UPPER' },
  // MACD signals
  { id: 'MACD=CROSS_UP',    test: c => c.macdSignal === 'CROSS_UP' },
  { id: 'MACD=CROSS_DOWN',  test: c => c.macdSignal === 'CROSS_DOWN' },
  { id: 'MACD=ABOVE',       test: c => c.macdSignal === 'ABOVE' },
  { id: 'MACD=BELOW',       test: c => c.macdSignal === 'BELOW' },
  // Trends
  { id: 'TREND_S=UP',       test: c => c.trendShort === 'UP' || c.trendShort === 'STRONG_UP' },
  { id: 'TREND_S=DOWN',     test: c => c.trendShort === 'DOWN' || c.trendShort === 'STRONG_DOWN' },
  { id: 'TREND_M=UP',       test: c => c.trendMedium === 'UP' || c.trendMedium === 'STRONG_UP' },
  { id: 'TREND_M=DOWN',     test: c => c.trendMedium === 'DOWN' || c.trendMedium === 'STRONG_DOWN' },
  { id: 'TREND_L=UP',       test: c => c.trendLong === 'UP' || c.trendLong === 'STRONG_UP' },
  { id: 'TREND_L=DOWN',     test: c => c.trendLong === 'DOWN' || c.trendLong === 'STRONG_DOWN' },
  // ADX
  { id: 'ADX>25',           test: c => c.adx14 > 25 },
  { id: 'ADX<15',           test: c => c.adx14 < 15 },
  // Volume
  { id: 'VOL=CLIMAX',       test: c => c.volumeProfile === 'CLIMAX' },
  { id: 'VOL=HIGH',         test: c => c.volumeProfile === 'HIGH' },
  { id: 'VOL=DRY',          test: c => c.volumeProfile === 'DRY' },
  // Stochastic
  { id: 'STOCH<20',         test: c => c.stochK < 20 },
  { id: 'STOCH>80',         test: c => c.stochK > 80 },
  // Regimes
  { id: 'REGIME=TREND_UP',  test: c => c.regime === 'TRENDING_UP' },
  { id: 'REGIME=TREND_DN',  test: c => c.regime === 'TRENDING_DOWN' },
  { id: 'REGIME=RANGING',   test: c => c.regime === 'RANGING' },
  { id: 'REGIME=VOLATILE',  test: c => c.regime === 'VOLATILE' },
];

function testRule(contexts: CandleContext[], conds: Condition[]): { count: number; wins: number; sumRet: number } {
  let count = 0, wins = 0, sumRet = 0;
  for (const ctx of contexts) {
    if (ctx.futureRet24h === null) continue;
    let match = true;
    for (const c of conds) { if (!c.test(ctx)) { match = false; break; } }
    if (!match) continue;
    count++;
    sumRet += ctx.futureRet24h;
    if (ctx.futureRet24h > 0) wins++;
  }
  return { count, wins, sumRet };
}

export function minePatterns(contexts: CandleContext[]): MinedRule[] {
  if (contexts.length < 100) {
    console.log(`[DEEP-MAP] Pattern mining: insufficient contexts (${contexts.length})`);
    return [];
  }

  console.log(`[DEEP-MAP] Pattern mining on ${contexts.length} contexts, ${CONDITIONS.length} conditions`);
  const rules: MinedRule[] = [];
  // Statistical hygiene: 20+ samples + Wilson LB ≥ 50% (i.e. p<0.05 vs random)
  // Combined with avgReturn ≥ 0.2% — eliminates noise without being too strict
  const minOccurrences2 = 25;
  const minOccurrences3 = 20;
  const minEdge = 0.002; // |avg return| > 0.2% (above noise)
  const minWilsonBuy = 0.50;  // Direction-aware Wilson LB ≥ 50% (statistically above random)

  function buildRule(conds: Condition[], r: { count: number; wins: number; sumRet: number }): MinedRule | null {
    const wr = (r.wins / r.count) * 100;
    const avgRet = r.sumRet / r.count;
    if (Math.abs(avgRet) < minEdge) return null;
    // Wilson LB on wins (for BUY) and on losses (for SELL)
    const wlbWins = wilsonLowerBound(r.wins, r.count);
    const wlbLosses = wilsonLowerBound(r.count - r.wins, r.count);
    const dir: 'BUY' | 'SELL' = avgRet > 0 ? 'BUY' : 'SELL';
    // Direction-aware confidence — high = strong signal in the chosen direction
    const wilson = dir === 'BUY' ? wlbWins : wlbLosses;
    if (wilson < minWilsonBuy) return null; // unified threshold (50%)
    return {
      id: conds.map(c => c.id).join('+'),
      conditions: conds.map(c => c.id),
      occurrences: r.count,
      winRate: Math.round(wr),
      wilsonLB: Math.round(wlbWins * 1000) / 10,    // raw (backward compat)
      wilson: Math.round(wilson * 1000) / 10,       // direction-aware
      avgReturn: Math.round(avgRet * 10000) / 100,
      direction: dir,
      edgeScore: wilson * Math.abs(avgRet) * Math.sqrt(r.count),
    };
  }

  // 2-combinations: 30×29/2 = 435
  let combos2 = 0;
  for (let i = 0; i < CONDITIONS.length; i++) {
    for (let j = i + 1; j < CONDITIONS.length; j++) {
      const r = testRule(contexts, [CONDITIONS[i], CONDITIONS[j]]);
      combos2++;
      if (r.count < minOccurrences2) continue;
      const rule = buildRule([CONDITIONS[i], CONDITIONS[j]], r);
      if (rule) rules.push(rule);
    }
  }
  console.log(`[DEEP-MAP] 2-combos tested: ${combos2}, kept: ${rules.length}`);

  // 3-combinations: 30×29×28/6 = 4060
  let combos3 = 0;
  let kept3 = 0;
  for (let i = 0; i < CONDITIONS.length; i++) {
    for (let j = i + 1; j < CONDITIONS.length; j++) {
      for (let k = j + 1; k < CONDITIONS.length; k++) {
        const r = testRule(contexts, [CONDITIONS[i], CONDITIONS[j], CONDITIONS[k]]);
        combos3++;
        if (r.count < minOccurrences3) continue;
        const rule = buildRule([CONDITIONS[i], CONDITIONS[j], CONDITIONS[k]], r);
        if (rule) { rules.push(rule); kept3++; }
      }
    }
  }
  console.log(`[DEEP-MAP] 3-combos tested: ${combos3}, kept: ${kept3}`);

  rules.sort((a, b) => b.edgeScore - a.edgeScore);
  const top = rules.slice(0, 50);
  console.log(`[DEEP-MAP] Pattern mining DONE: ${top.length} top rules (Wilson-validated)`);
  return top;
}
