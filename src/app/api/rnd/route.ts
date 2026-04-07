import { NextResponse } from 'next/server';
import type { OHLCV } from '@/types';
import { computeIndicators } from '@/lib/core/indicators';
import { detectPatterns } from '@/lib/core/patterns';
import { getAllRunnableStrategies, simpleBacktest } from '@/lib/research/rnd/strategy-runner';
import { generateAssetProfile } from '@/lib/research/rnd/asset-profile';
import { analyzeBehavior as deepBehavior } from '@/lib/research/rnd/behavior-analysis';
import { downloadHistory } from '@/lib/research/rnd/history-loader';
import { redisGet, redisSet } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

// ── Helpers ───────────────────────────────────────────────

async function loadCandles(asset: string, tf: string): Promise<OHLCV[]> {
  const raw = await redisGet<number[][]>(`nexus:rnd:candles:${asset}:${tf}`);
  if (!raw) return [];
  // c[0] is a timestamp in ms (number). Convert to ISO string so new Date(c.date) works.
  return raw.map(c => ({ date: new Date(c[0]).toISOString(), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] ?? 0 }));
}

function analyzeBehavior(candles: OHLCV[]) {
  const hourly: Record<number, { returns: number[]; greens: number; total: number }> = {};
  const daily: Record<number, { returns: number[]; greens: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hourly[h] = { returns: [], greens: 0, total: 0 };
  for (let d = 0; d < 7; d++) daily[d] = { returns: [], greens: 0, total: 0 };

  for (const c of candles) {
    const dt = new Date(c.date);
    if (isNaN(dt.getTime())) continue;
    const ret = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    const h = dt.getUTCHours();
    const d = dt.getUTCDay();
    hourly[h].returns.push(ret); if (ret > 0) hourly[h].greens++; hourly[h].total++;
    daily[d].returns.push(ret); if (ret > 0) daily[d].greens++; daily[d].total++;
  }

  const hourlyStats = Object.entries(hourly).map(([h, b]) => {
    const avg = b.returns.length > 0 ? b.returns.reduce((s, r) => s + r, 0) / b.returns.length : 0;
    const vol = b.returns.length > 1 ? Math.sqrt(b.returns.reduce((s, r) => s + (r - avg) ** 2, 0) / b.returns.length) : 0;
    return { hour: +h, avgReturn: Math.round(avg * 1000) / 1000, volatility: Math.round(vol * 1000) / 1000, winRate: b.total > 0 ? Math.round((b.greens / b.total) * 100) : 50, samples: b.total };
  });

  const dailyStats = Object.entries(daily).map(([d, b]) => {
    const avg = b.returns.length > 0 ? b.returns.reduce((s, r) => s + r, 0) / b.returns.length : 0;
    return { day: +d, avgReturn: Math.round(avg * 1000) / 1000, winRate: b.total > 0 ? Math.round((b.greens / b.total) * 100) : 50, samples: b.total };
  });

  const bestHours = hourlyStats.filter(h => h.winRate > 58 && h.samples >= 5).map(h => h.hour);
  const worstHours = hourlyStats.filter(h => h.winRate < 42 && h.samples >= 5).map(h => h.hour);

  return { hourly: hourlyStats, daily: dailyStats, bestHours, worstHours, totalCandles: candles.length };
}

function analyzeIndicators(candles: OHLCV[], tf: string) {
  if (candles.length < 60) return [];
  const ind = computeIndicators(candles);
  const lookAhead = tf === '1d' ? 1 : tf === '4h' ? 6 : tf === '1h' ? 24 : 96;
  const results: { name: string; condition: string; signals: number; wins: number; losses: number; accuracy: number; avgReturn: number }[] = [];

  // direction: 'BUY' | 'SELL' to know which side to check
  const conditions: { name: string; cond: string; dir: 'BUY' | 'SELL'; check: (i: number) => boolean }[] = [
    { name: 'RSI', cond: 'Oversold (<30)', dir: 'BUY', check: (i) => ind.rsi[i] < 30 },
    { name: 'RSI', cond: 'Overbought (>70)', dir: 'SELL', check: (i) => ind.rsi[i] > 70 },
    { name: 'MACD', cond: 'Cross Up', dir: 'BUY', check: (i) => i > 0 && ind.macd.histogram[i] > 0 && ind.macd.histogram[i - 1] <= 0 },
    { name: 'MACD', cond: 'Cross Down', dir: 'SELL', check: (i) => i > 0 && ind.macd.histogram[i] < 0 && ind.macd.histogram[i - 1] >= 0 },
    { name: 'Bollinger', cond: 'Lower Touch', dir: 'BUY', check: (i) => ind.bollinger.lower[i] !== null && candles[i].close <= (ind.bollinger.lower[i] as number) * 1.005 },
    { name: 'Bollinger', cond: 'Upper Touch', dir: 'SELL', check: (i) => ind.bollinger.upper[i] !== null && candles[i].close >= (ind.bollinger.upper[i] as number) * 0.995 },
    { name: 'Bollinger', cond: 'Squeeze', dir: 'BUY', check: (i) => ind.bollinger.squeeze[i] },
    { name: 'ADX', cond: 'Strong Trend (>25)', dir: 'BUY', check: (i) => ind.adx[i] > 25 && ind.ema9[i] > ind.ema21[i] },
    { name: 'Stochastic', cond: 'Oversold (<20)', dir: 'BUY', check: (i) => ind.stochastic.k[i] < 20 },
    { name: 'Stochastic', cond: 'Overbought (>80)', dir: 'SELL', check: (i) => ind.stochastic.k[i] > 80 },
    { name: 'EMA', cond: 'Bullish Cross (EMA9>EMA21)', dir: 'BUY', check: (i) => i > 0 && ind.ema9[i] > ind.ema21[i] && ind.ema9[i - 1] <= ind.ema21[i - 1] },
    { name: 'Volume', cond: 'Spike (>1.5x avg)', dir: 'BUY', check: (i) => ind.volume.spike[i] && candles[i].close > candles[i].open },
    // Advanced combos
    { name: 'Combo', cond: 'Oversold Reversal (RSI<35+BB Lower+Stoch<25)', dir: 'BUY', check: (i) => ind.rsi[i] < 35 && ind.bollinger.lower[i] !== null && candles[i].close <= (ind.bollinger.lower[i] as number) * 1.01 && ind.stochastic.k[i] < 25 },
    { name: 'Combo', cond: 'Trend Confirmation (EMA9>21+MACD+ADX>25)', dir: 'BUY', check: (i) => ind.ema9[i] > ind.ema21[i] && ind.macd.histogram[i] > 0 && ind.adx[i] > 25 },
    { name: 'Combo', cond: 'Squeeze Breakout (BB expansion+Close>Upper)', dir: 'BUY', check: (i) => i > 1 && ind.bollinger.squeeze[i - 1] && !ind.bollinger.squeeze[i] && ind.bollinger.upper[i] !== null && candles[i].close > (ind.bollinger.upper[i] as number) * 0.995 },
    { name: 'Combo', cond: 'Volume Climax Reversal (Vol>2x+RSI<30+Red)', dir: 'BUY', check: (i) => ind.volume.spike[i] && ind.rsi[i] < 30 && candles[i].close < candles[i].open },
    { name: 'Combo', cond: 'MACD Cross + ADX Strong', dir: 'BUY', check: (i) => i > 0 && ind.macd.histogram[i] > 0 && ind.macd.histogram[i - 1] <= 0 && ind.adx[i] > 25 },
    { name: 'Combo', cond: 'EMA Bullish + Vol Spike', dir: 'BUY', check: (i) => ind.ema9[i] > ind.ema21[i] && ind.volume.spike[i] },
  ];

  for (const { name, cond, dir, check } of conditions) {
    let signals = 0, wins = 0, losses = 0, totalRet = 0;
    for (let i = 50; i < candles.length - lookAhead; i++) {
      try {
        if (!check(i)) continue;
        signals++;

        // Target scales with sqrt(lookAhead) — random walk volatility model
        // For BTC 1h, lookAhead=24, ATR=1.5% → target ~2.1% (above typical noise)
        const atr = ind.atr[i] ?? 0;
        const atrPct = atr > 0 ? atr / candles[i].close : 0.01;
        const targetPct = Math.max(0.008, atrPct * Math.sqrt(lookAhead / 12));

        // Final return at end of lookAhead window — this is what actually matters
        const futureClose = candles[Math.min(i + lookAhead, candles.length - 1)].close;
        const finalRet = dir === 'BUY' ? (futureClose - candles[i].close) / candles[i].close : (candles[i].close - futureClose) / candles[i].close;
        totalRet += finalRet;

        // Win = the FINAL return exceeded target in the correct direction
        // Loss = the FINAL return was negative beyond target
        // This eliminates "noise wins" where price briefly hit target then reversed
        if (finalRet >= targetPct) wins++;
        else if (finalRet <= -targetPct) losses++;
      } catch {}
    }
    if (signals >= 5) {
      const accuracy = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 50;
      const avgReturn = Math.round((totalRet / signals) * 10000) / 100;
      results.push({
        name, condition: cond, signals, wins, losses,
        accuracy,
        avgReturn,
      });
    }
  }

  // Filter: keep indicators with positive expectancy
  // (accuracy ≥ 50 AND positive avg return) OR clear edge (accuracy ≥ 60)
  return results
    .filter(r => (r.accuracy >= 50 && r.avgReturn > 0) || r.accuracy >= 60)
    .sort((a, b) => {
      // Score = accuracy + avgReturn × 100 (rewards both metrics)
      const scoreA = a.accuracy + a.avgReturn * 100;
      const scoreB = b.accuracy + b.avgReturn * 100;
      return scoreB - scoreA;
    });
}

function analyzePatterns(candles: OHLCV[]) {
  if (candles.length < 60) return [];
  const detected = detectPatterns(candles);
  const lookAhead = 5;
  const byType: Record<string, { occurrences: number; wins: number; losses: number; totalReturn: number }> = {};

  for (const p of detected) {
    if (p.index >= candles.length - lookAhead) continue;
    if (!byType[p.type]) byType[p.type] = { occurrences: 0, wins: 0, losses: 0, totalReturn: 0 };
    byType[p.type].occurrences++;
    const futureClose = candles[Math.min(p.index + lookAhead, candles.length - 1)].close;
    const ret = (futureClose - candles[p.index].close) / candles[p.index].close;
    byType[p.type].totalReturn += ret;
    const isBullish = p.signal === 'BUY';
    if (isBullish ? ret > 0.003 : ret < -0.003) byType[p.type].wins++;
    else if (isBullish ? ret < -0.003 : ret > 0.003) byType[p.type].losses++;
  }

  return Object.entries(byType).map(([type, data]) => ({
    pattern: type.replace(/_/g, ' '),
    occurrences: data.occurrences,
    winRate: data.wins + data.losses > 0 ? Math.round((data.wins / (data.wins + data.losses)) * 100) : 50,
    avgReturn: data.occurrences > 0 ? Math.round((data.totalReturn / data.occurrences) * 10000) / 100 : 0,
  })).filter(p => p.occurrences >= 3).sort((a, b) => b.winRate - a.winRate);
}

function testStrategies(candles: OHLCV[], asset: string) {
  if (candles.length < 100) return [];
  const t0 = Date.now();

  // Limit candles for performance: max 2500 (was 3000) — safer for 55s timeout on 1GB server
  const trimmed = candles.length > 2500 ? candles.slice(-2500) : candles;

  // ── Data validation ──
  const sample0 = trimmed[0]; const sampleMid = trimmed[Math.floor(trimmed.length / 2)]; const sampleEnd = trimmed[trimmed.length - 1];
  console.log(`[RND][STRAT] === START === ${trimmed.length} candles`);
  console.log(`[RND][STRAT] Data check: first=[o=${sample0.open} h=${sample0.high} l=${sample0.low} c=${sample0.close} v=${sample0.volume}]`);
  console.log(`[RND][STRAT] Data check: mid=[o=${sampleMid.open} c=${sampleMid.close}] last=[o=${sampleEnd.open} c=${sampleEnd.close}]`);

  if (sample0.open === 0 || sampleEnd.close === 0 || isNaN(sample0.close) || isNaN(sampleEnd.close)) {
    console.error('[RND][STRAT] INVALID DATA — candles have 0 or NaN values');
    return [];
  }

  // Pre-compute indicators ONCE
  const indicators = computeIndicators(trimmed);

  // Log indicator health
  const checkIdx = Math.min(100, trimmed.length - 1);
  console.log(`[RND][STRAT] Indicators@${checkIdx}: rsi=${indicators.rsi[checkIdx]?.toFixed(1)} adx=${indicators.adx[checkIdx]?.toFixed(1)} atr=${indicators.atr[checkIdx]?.toFixed(2)} macdH=${indicators.macd.histogram[checkIdx]?.toFixed(4)} ema21=${indicators.ema21[checkIdx]?.toFixed(2)} sma50=${indicators.sma50[checkIdx]}`);

  // ── Get all 12 runnable strategies (6 custom + 6 famous) ──
  const runnable = getAllRunnableStrategies(indicators);

  // ── Diagnostic: count raw signals per strategy ──
  for (const s of runnable) {
    let buys = 0, sells = 0;
    for (let i = 50; i < trimmed.length; i++) {
      const sig = s.run(trimmed, i);
      if (sig.direction === 'BUY') buys++;
      else if (sig.direction === 'SELL') sells++;
    }
    console.log(`[RND][DIAG] ${s.name} (${s.type}): ${buys}buy ${sells}sell in ${trimmed.length - 50} bars`);
  }

  // ── Adaptive grid search per strategy type ──
  function getGrid(name: string): { sl: number[]; tp: number[] } {
    const lower = name.toLowerCase();
    if (lower.includes('scalp') || lower.includes('ribbon')) return { sl: [0.005, 0.008, 0.012], tp: [0.012, 0.018, 0.025] };
    if (lower.includes('turtle') || lower === 'trend') return { sl: [0.02, 0.03, 0.05], tp: [0.04, 0.06, 0.10] };
    return { sl: [0.01, 0.015, 0.02, 0.03], tp: [0.02, 0.03, 0.04, 0.06] };
  }

  // ── Expectancy-based grading ──
  function calcGrade(r: any): string {
    const exp = r.expectancy;  // % per trade
    const wr = r.winRate;
    const pf = r.profitFactor;
    const trades = r.totalTrades;
    if (trades < 30) return trades > 10 ? 'C' : trades > 3 ? 'D' : 'F';
    if (exp > 0.30 && pf > 1.5 && wr > 48) return 'A';
    if (exp > 0.15 && pf > 1.3 && wr > 45) return 'B';
    if (exp > 0.05 && pf > 1.1) return 'C';
    if (exp > 0) return 'D';
    return 'F';
  }

  const results: any[] = [];

  for (const strat of runnable) {
    const { sl: SL, tp: TP } = getGrid(strat.name);
    let bestResult: any = null;
    let bestSL = SL[0];
    let bestTP = TP[0];
    let bestScore = -Infinity;
    let maxTrades = 0;

    for (const sl of SL) {
      for (const tp of TP) {
        if (tp <= sl) continue;
        try {
          const bt = simpleBacktest(trimmed, strat, sl, tp);
          maxTrades = Math.max(maxTrades, bt.totalTrades);
          if (bt.totalTrades < 1) continue;
          // Score = expectancy × profit factor × sqrt(trades) — rewards consistent edge over many trades
          const score = bt.expectancy * Math.min(bt.profitFactor, 5) * Math.sqrt(bt.totalTrades);
          if (score > bestScore) {
            bestScore = score;
            bestResult = bt;
            bestSL = sl;
            bestTP = tp;
          }
        } catch (e: any) {
          console.warn(`[RND] simpleBacktest failed ${strat.name} SL=${sl} TP=${tp}:`, e.message);
        }
      }
    }

    if (bestResult) {
      const grade = calcGrade(bestResult);
      // Find best regime for this strategy
      const bestRegime = (bestResult.byRegime ?? []).filter((r: any) => r.trades >= 5).sort((a: any, b: any) => b.expectancy - a.expectancy)[0];
      const worstRegime = (bestResult.byRegime ?? []).filter((r: any) => r.trades >= 5).sort((a: any, b: any) => a.expectancy - b.expectancy)[0];

      results.push({
        name: strat.name,
        type: strat.type,
        grade,
        totalReturn: bestResult.totalReturn,
        grossReturn: bestResult.grossReturn,
        expectancy: bestResult.expectancy,
        avgTradeReturn: bestResult.avgTradeReturn,
        totalTrades: bestResult.totalTrades,
        trades: bestResult.totalTrades,
        winRate: bestResult.winRate,
        maxDrawdown: bestResult.maxDrawdown,
        maxDD: Math.abs(bestResult.maxDrawdown),
        sharpeRatio: bestResult.sharpeRatio,
        sharpe: bestResult.sharpeRatio,
        profitFactor: bestResult.profitFactor,
        avgWin: bestResult.avgWin,
        avgLoss: bestResult.avgLoss,
        optimalSL: Math.round(bestSL * 1000) / 10,
        optimalTP: Math.round(bestTP * 1000) / 10,
        sl: Math.round(bestSL * 1000) / 10,
        tp: Math.round(bestTP * 1000) / 10,
        score: Math.round(bestScore * 100) / 100,
        byRegime: bestResult.byRegime ?? [],
        bestRegime: bestRegime?.regime ?? null,
        worstRegime: worstRegime?.regime ?? null,
        recommendation: grade === 'A' ? 'STRONG_USE' : grade === 'B' ? 'USE' : grade === 'C' ? 'CAUTION' : grade === 'D' ? 'AVOID' : 'NEVER',
      });
      console.log(`[RND][STRAT] ${strat.name}: trades=${bestResult.totalTrades} exp=${bestResult.expectancy}% pf=${bestResult.profitFactor} wr=${bestResult.winRate}% grade=${grade} bestRegime=${bestRegime?.regime ?? '—'}`);
    } else {
      results.push({
        name: strat.name,
        type: strat.type,
        grade: 'F',
        totalReturn: 0, grossReturn: 0, expectancy: 0, avgTradeReturn: 0,
        totalTrades: 0, trades: 0, winRate: 0, maxDrawdown: 0, maxDD: 0,
        sharpeRatio: 0, sharpe: 0, profitFactor: 0, avgWin: 0, avgLoss: 0,
        optimalSL: 2, optimalTP: 4, sl: 2, tp: 4, score: -999,
        byRegime: [], bestRegime: null, worstRegime: null,
        recommendation: 'NEVER — nessun trade generato',
      });
      console.log(`[RND][STRAT] ${strat.name}: NO TRADES`);
    }
  }

  // Sort by expectancy descending (true edge per trade)
  results.sort((a, b) => (b.expectancy ?? -999) - (a.expectancy ?? -999));
  console.log(`[RND][STRAT] === DONE === ${results.length} strategies in ${Date.now() - t0}ms`);
  return results;
}

function generateReport(asset: string, tf: string, behavior: any, indicators: any[], patterns: any[], strategies: any[]) {
  // Recommended: top 3 BY RETURN that are positive (any grade)
  // Avoid: only those that LOSE money (negative return)
  const sortedByReturn = [...strategies].sort((a: any, b: any) => (b.totalReturn ?? 0) - (a.totalReturn ?? 0));
  const recommended = sortedByReturn.filter((s: any) => (s.totalReturn ?? 0) > 0).slice(0, 3);
  const avoid = sortedByReturn.filter((s: any) => (s.totalReturn ?? 0) < 0).map((s: any) => ({
    ...s,
    reason: `Perde ${Math.abs(s.totalReturn).toFixed(2)}% — ${s.recommendation ?? 'NEVER'}`,
  }));
  const topIndicators = indicators.filter((i: any) => i.accuracy > 55).slice(0, 5);
  const topPatterns = patterns.filter((p: any) => p.winRate > 55 && p.occurrences >= 3).slice(0, 5);

  // Summary with outlook
  let outlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 50;
  if (behavior?.summary?.overallTrend === 'BULLISH') { outlook = 'BULLISH'; confidence += 10; }
  if (behavior?.summary?.overallTrend === 'BEARISH') { outlook = 'BEARISH'; confidence -= 10; }
  if (strategies[0]?.grade === 'A') confidence += 15;
  else if (strategies[0]?.grade === 'B') confidence += 8;
  else if (strategies[0]?.grade === 'F') confidence -= 10;
  confidence = Math.max(20, Math.min(90, confidence));

  let keyInsight = '';
  const top = recommended[0];
  if (recommended.length === 0) {
    keyInsight = 'Nessuna strategia profittevole trovata su questo asset/timeframe/periodo. Provare un timeframe diverso o un periodo più lungo.';
  } else if (top && (top.grade === 'A' || top.grade === 'B')) {
    keyInsight = `Strategia consigliata: ${top.name} (+${top.totalReturn}% return, ${top.winRate}% WR, Sharpe ${top.sharpe ?? top.sharpeRatio}). Grade ${top.grade}.`;
    if (topIndicators[0]) keyInsight += ` Indicatore più affidabile: ${topIndicators[0].name} ${topIndicators[0].condition} (${topIndicators[0].accuracy}% accuracy).`;
  } else if (top && top.grade === 'C') {
    keyInsight = `Migliore strategia: ${top.name} (+${top.totalReturn}% return, ${top.winRate}% WR). Profittabile ma marginale — monitorare con attenzione.`;
  } else if (top) {
    // Grade D — positive but weak
    keyInsight = `Migliore strategia: ${top.name} (+${top.totalReturn}% return), ma con rendimento marginale. Considerare un timeframe diverso o un periodo più lungo per risultati migliori.`;
  }

  // Trading schedule from behavior
  const tradingSchedule = behavior?.bestTradingWindows || behavior?.worstTradingWindows ? {
    bestHours: behavior.bestTradingWindows?.slice(0, 3).map((w: any) => w.description).join(', ') || 'N/A',
    avoidHours: behavior.worstTradingWindows?.slice(0, 2).map((w: any) => w.description).join(', ') || 'N/A',
    bestDays: (behavior.daily ?? []).filter((d: any) => d.winRate > 55 || d.rating === 'EXCELLENT' || d.rating === 'GOOD').map((d: any) => d.dayName ?? ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][d.day]).join(', ') || 'N/A',
    overallTrend: behavior.summary?.overallTrend ?? 'N/A',
  } : null;

  // Warnings
  const warnings: string[] = [];
  if (!strategies.length) warnings.push('Nessuna strategia testata — il rapporto è parziale');
  if (strategies.length > 0 && strategies.every((s: any) => s.grade === 'F')) warnings.push('TUTTE le strategie hanno grade F — questo asset/timeframe potrebbe non essere adatto al trading automatico');
  if (behavior?.summary?.avgDailyVolatility > 5) warnings.push('Volatilità molto alta (>5%) — usare size ridotto');
  if (indicators.length > 0 && indicators.every((i: any) => i.accuracy < 55)) warnings.push('Nessun indicatore supera il 55% di accuracy — segnali poco affidabili');
  if (!behavior) warnings.push('Analisi comportamentale non disponibile');

  // Insights
  const insights: string[] = [];
  if (behavior?.bestHours?.length > 0) insights.push(`Migliori ore: ${behavior.bestHours.join(', ')} UTC`);
  if (behavior?.worstHours?.length > 0) insights.push(`Evitare: ${behavior.worstHours.join(', ')} UTC`);
  if (topIndicators.length > 0) insights.push(`Miglior indicatore: ${topIndicators[0].name} ${topIndicators[0].condition} (${topIndicators[0].accuracy}% accuracy)`);
  if (topPatterns.length > 0) insights.push(`Miglior pattern: ${topPatterns[0].pattern} (${topPatterns[0].winRate}% WR, ${topPatterns[0].occurrences}x)`);
  if (recommended.length > 0) insights.push(`Strategia raccomandata: ${recommended[0].name} (WR ${recommended[0].winRate}%, expectancy +${recommended[0].expectancy ?? 0}% per trade)`);

  // Per-regime suggestions for top strategies
  for (const s of recommended.slice(0, 3)) {
    if (s.bestRegime && s.byRegime?.length > 0) {
      const best = s.byRegime.find((r: any) => r.regime === s.bestRegime);
      if (best && best.trades >= 5) insights.push(`USARE ${s.name} in regime ${s.bestRegime} (WR ${best.winRate}%, ${best.trades} trade)`);
    }
    if (s.worstRegime && s.worstRegime !== s.bestRegime) {
      const worst = s.byRegime.find((r: any) => r.regime === s.worstRegime);
      if (worst && worst.expectancy < 0 && worst.trades >= 5) insights.push(`EVITARE ${s.name} in regime ${s.worstRegime} (WR ${worst.winRate}%, exp ${worst.expectancy}%)`);
    }
  }

  // ── Bot config: actionable rules from the analysis ──
  const primary = recommended[0];
  const secondary = recommended[1];
  const botConfig = {
    primaryStrategy: primary?.name ?? null,
    fallbackStrategy: secondary?.name ?? null,
    optimalSL: primary?.optimalSL ?? primary?.sl ?? 2,
    optimalTP: primary?.optimalTP ?? primary?.tp ?? 4,
    confidenceThreshold: primary && primary.winRate > 55 ? 55 : 60,
    avoidHours: (behavior?.hourly ?? []).filter((h: any) => h.winRate < 44 && h.sampleSize >= 5).map((h: any) => h.hour),
    boostHours: (behavior?.hourly ?? []).filter((h: any) => h.winRate > 56 && h.sampleSize >= 5).map((h: any) => h.hour),
    regimeRules: (primary?.byRegime ?? []).map((r: any) => ({
      regime: r.regime,
      action: r.winRate > 55 && r.expectancy > 0.1 ? 'TRADE' : r.winRate > 45 && r.expectancy > 0 ? 'CAUTION' : 'SKIP',
      winRate: r.winRate,
      expectancy: r.expectancy,
      trades: r.trades,
    })),
    bestIndicator: topIndicators[0]?.name ?? null,
    bestIndicatorCondition: topIndicators[0]?.condition ?? null,
    maxDailyTrades: 5,
    maxConsecutiveLosses: 3,
    positionSizePct: primary && Math.abs(primary.maxDrawdown ?? primary.maxDD ?? 0) < 5 ? 3 : 2,
  };

  // ── Action summary: human-readable rules ──
  const actionSummary: string[] = [];
  if (botConfig.primaryStrategy) {
    actionSummary.push(`STRATEGIA PRINCIPALE: ${botConfig.primaryStrategy}`);
    if (botConfig.fallbackStrategy) actionSummary.push(`BACKUP: ${botConfig.fallbackStrategy}`);
    actionSummary.push(`SL: ${botConfig.optimalSL}% · TP: ${botConfig.optimalTP}%`);
    actionSummary.push(`Confidence minima: ${botConfig.confidenceThreshold}%`);
    if (botConfig.avoidHours.length > 0) actionSummary.push(`NON tradare alle ore UTC: ${botConfig.avoidHours.join(', ')}`);
    if (botConfig.boostHours.length > 0) actionSummary.push(`Ore migliori UTC: ${botConfig.boostHours.join(', ')}`);
    if (botConfig.regimeRules.length > 0) {
      const tradeRegimes = botConfig.regimeRules.filter((r: any) => r.action === 'TRADE');
      const skipRegimes = botConfig.regimeRules.filter((r: any) => r.action === 'SKIP');
      if (tradeRegimes.length > 0) actionSummary.push(`TRADE in regime: ${tradeRegimes.map((r: any) => `${r.regime} (${r.winRate}% WR)`).join(', ')}`);
      if (skipRegimes.length > 0) actionSummary.push(`SKIP in regime: ${skipRegimes.map((r: any) => `${r.regime} (${r.winRate}% WR)`).join(', ')}`);
    }
    if (botConfig.bestIndicator) actionSummary.push(`Filtro indicatore: ${botConfig.bestIndicator} ${botConfig.bestIndicatorCondition}`);
    actionSummary.push(`Position size: ${botConfig.positionSizePct}% del capitale`);
    actionSummary.push(`Max ${botConfig.maxDailyTrades} trade/giorno · pausa dopo ${botConfig.maxConsecutiveLosses} loss consecutivi`);
  } else {
    actionSummary.push('Nessuna configurazione disponibile — nessuna strategia profittevole trovata');
  }

  return {
    asset, timeframe: tf, generatedAt: new Date().toISOString(),
    dataAvailable: { behavior: !!behavior, indicators: indicators.length, patterns: patterns.length, strategies: strategies.length },
    summary: { outlook, confidence, keyInsight },
    recommended, avoid, topIndicators, topPatterns,
    tradingSchedule, warnings, insights,
    botConfig, actionSummary,
    totalStrategiesTested: strategies.length,
    candlesAnalyzed: behavior?.totalCandles ?? behavior?.summary?.totalCandles ?? 0,
  };
}

// ── Routes ────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') ?? 'status';
  const asset = searchParams.get('asset');

  if (action === 'report' && asset) {
    const tf = searchParams.get('tf') ?? '1h';
    const report = await redisGet(`nexus:rnd:report:${asset}:${tf}`);
    return NextResponse.json({ report });
  }
  if (action === 'behavior' && asset) { const tf = searchParams.get('tf') ?? '1h'; return NextResponse.json(await redisGet(`nexus:rnd:behavior:${asset}:${tf}`) ?? {}); }
  if (action === 'indicators' && asset) { const tf = searchParams.get('tf') ?? '1h'; return NextResponse.json(await redisGet(`nexus:rnd:indicators:${asset}:${tf}`) ?? []); }
  if (action === 'patterns' && asset) { const tf = searchParams.get('tf') ?? '1h'; return NextResponse.json(await redisGet(`nexus:rnd:patterns:${asset}:${tf}`) ?? []); }
  if (action === 'strategies' && asset) { const tf = searchParams.get('tf') ?? '1h'; return NextResponse.json(await redisGet(`nexus:rnd:strategies:${asset}:${tf}`) ?? []); }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action, asset, timeframe: tf = '1h' } = body;

  if (!asset && action !== 'status') return NextResponse.json({ error: 'Asset required' }, { status: 400 });

  try {
    switch (action) {
      case 'download': {
        const months = parseInt(body.period ?? '6');
        console.log(`[RND] Download ${asset} ${tf} months=${months}`);
        const { candles, source } = await downloadHistory(asset, tf, months);
        if (candles.length < 50) return NextResponse.json({ error: `Solo ${candles.length} candele. Servono almeno 50.` }, { status: 400 });
        const compressed = candles.map(c => [new Date(c.date).getTime(), c.open, c.high, c.low, c.close, c.volume]);
        await redisSet(`nexus:rnd:candles:${asset}:${tf}`, compressed, 604800);
        const from = candles[0].date.slice(0, 10);
        const to = candles[candles.length - 1].date.slice(0, 10);
        const spanDays = Math.round((new Date(candles[candles.length - 1].date).getTime() - new Date(candles[0].date).getTime()) / 86400000);
        console.log(`[RND] Download done: ${candles.length} candles, ${from} → ${to} (${spanDays} days, requested ${months}mo)`);
        return NextResponse.json({ phase: 'download', candles: candles.length, source, from, to, spanDays, requestedMonths: months, volumeReal: candles.some(c => c.volume > 0) });
      }

      case 'analyze-behavior': {
        const candles = await loadCandles(asset, tf);
        if (!candles.length) return NextResponse.json({ error: 'Nessun dato. Esegui prima il download.' }, { status: 400 });
        const behavior = deepBehavior(candles);
        await redisSet(`nexus:rnd:behavior:${asset}:${tf}`, behavior, 86400);
        return NextResponse.json({ phase: 'behavior', data: behavior });
      }

      case 'analyze-indicators': {
        const candles = await loadCandles(asset, tf);
        if (!candles.length) return NextResponse.json({ error: 'Nessun dato.' }, { status: 400 });
        const indicators = analyzeIndicators(candles, tf);
        await redisSet(`nexus:rnd:indicators:${asset}:${tf}`, indicators, 86400);
        return NextResponse.json({ phase: 'indicators', data: indicators });
      }

      case 'analyze-patterns': {
        const candles = await loadCandles(asset, tf);
        if (!candles.length) return NextResponse.json({ error: 'Nessun dato.' }, { status: 400 });
        const patterns = analyzePatterns(candles);
        await redisSet(`nexus:rnd:patterns:${asset}:${tf}`, patterns, 86400);
        return NextResponse.json({ phase: 'patterns', data: patterns });
      }

      case 'test-strategies': {
        const candles = await loadCandles(asset, tf);
        if (!candles.length) return NextResponse.json({ error: 'Nessun dato.' }, { status: 400 });
        console.log(`[RND] Starting strategy test: ${asset} ${tf}, ${candles.length} candles`);
        try {
          const strategies = testStrategies(candles, asset);
          console.log(`[RND] Strategy test done: ${strategies.length} strategies`);
          await redisSet(`nexus:rnd:strategies:${asset}:${tf}`, strategies, 86400);
          return NextResponse.json({ phase: 'strategies', data: strategies });
        } catch (error: any) {
          console.error(`[RND] Strategy test FAILED:`, error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
          return NextResponse.json({ error: `Strategie: ${error.message}` }, { status: 500 });
        }
      }

      case 'generate-report': {
        try {
          const behavior = await redisGet(`nexus:rnd:behavior:${asset}:${tf}`) ?? {};
          const rIndicators = await redisGet<any[]>(`nexus:rnd:indicators:${asset}:${tf}`) ?? [];
          const rPatterns = await redisGet<any[]>(`nexus:rnd:patterns:${asset}:${tf}`) ?? [];
          const rStrategies = await redisGet<any[]>(`nexus:rnd:strategies:${asset}:${tf}`) ?? [];
          const report = generateReport(asset, tf, behavior, rIndicators, rPatterns, rStrategies);
          await redisSet(`nexus:rnd:report:${asset}:${tf}`, report, 86400);
          // Also generate asset profile for bots
          const candles = await loadCandles(asset, tf);
          if (candles.length > 20) {
            const profile = generateAssetProfile(candles, asset, tf);
            profile.bestIndicators = rIndicators.filter((i: any) => i.accuracy > 55).slice(0, 5).map((i: any) => ({ name: `${i.name} ${i.condition}`, accuracy: i.accuracy }));
            if (rStrategies[0]) profile.bestStrategy = { name: rStrategies[0].name, winRate: rStrategies[0].winRate, returnPct: rStrategies[0].totalReturn };
            await redisSet(`nexus:rnd:profile:${asset}:${tf}`, profile, 86400);
          }
          return NextResponse.json({ phase: 'report', data: report });
        } catch (error: any) {
          console.error(`[RND] Report generation FAILED:`, error.message);
          return NextResponse.json({ error: `Rapporto: ${error.message}` }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err: any) {
    console.error(`[RND] Error:`, err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
