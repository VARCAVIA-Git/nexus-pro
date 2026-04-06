import { NextResponse } from 'next/server';
import type { OHLCV } from '@/types';
import { computeIndicators } from '@/lib/engine/indicators';
import { detectPatterns } from '@/lib/engine/patterns';
import { getAllRunnableStrategies, simpleBacktest } from '@/lib/engine/rnd/strategy-runner';
import { generateAssetProfile } from '@/lib/engine/rnd/asset-profile';
import { analyzeBehavior as deepBehavior } from '@/lib/engine/rnd/behavior-analysis';
import { downloadHistory } from '@/lib/engine/rnd/history-loader';
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

  const conditions: [string, string, (i: number) => boolean][] = [
    ['RSI', 'Oversold (<30)', (i) => ind.rsi[i] < 30],
    ['RSI', 'Overbought (>70)', (i) => ind.rsi[i] > 70],
    ['MACD', 'Cross Up', (i) => ind.macd.histogram[i] > 0 && ind.macd.histogram[i - 1] <= 0],
    ['MACD', 'Cross Down', (i) => ind.macd.histogram[i] < 0 && ind.macd.histogram[i - 1] >= 0],
    ['Bollinger', 'Lower Touch', (i) => ind.bollinger.lower[i] !== null && candles[i].close <= (ind.bollinger.lower[i] as number) * 1.005],
    ['Bollinger', 'Upper Touch', (i) => ind.bollinger.upper[i] !== null && candles[i].close >= (ind.bollinger.upper[i] as number) * 0.995],
    ['Bollinger', 'Squeeze', (i) => ind.bollinger.squeeze[i]],
    ['ADX', 'Strong Trend (>25)', (i) => ind.adx[i] > 25],
    ['ADX', 'No Trend (<15)', (i) => ind.adx[i] < 15],
    ['Stochastic', 'Oversold (<20)', (i) => ind.stochastic.k[i] < 20],
    ['Stochastic', 'Overbought (>80)', (i) => ind.stochastic.k[i] > 80],
    ['EMA', 'Bullish Cross (EMA9>EMA21)', (i) => ind.ema9[i] > ind.ema21[i] && ind.ema9[i - 1] <= ind.ema21[i - 1]],
    ['Volume', 'Spike (>1.5x avg)', (i) => ind.volume.spike[i]],
    ['Combo', 'RSI<30 + BB Lower', (i) => ind.rsi[i] < 30 && ind.bollinger.lower[i] !== null && candles[i].close <= (ind.bollinger.lower[i] as number) * 1.01],
    ['Combo', 'MACD Up + ADX>25', (i) => ind.macd.histogram[i] > 0 && ind.macd.histogram[i - 1] <= 0 && ind.adx[i] > 25],
    ['Combo', 'EMA Bullish + Vol Spike', (i) => ind.ema9[i] > ind.ema21[i] && ind.volume.spike[i]],
  ];

  for (const [name, cond, check] of conditions) {
    let signals = 0, wins = 0, losses = 0, totalRet = 0;
    for (let i = 50; i < candles.length - lookAhead; i++) {
      try {
        if (check(i)) {
          signals++;
          const futureClose = candles[Math.min(i + lookAhead, candles.length - 1)].close;
          const ret = (futureClose - candles[i].close) / candles[i].close;
          totalRet += ret;
          const isBuySignal = cond.includes('Oversold') || cond.includes('Lower') || cond.includes('Bullish') || cond.includes('Cross Up') || cond.includes('Squeeze') || cond.includes('Spike') || cond.includes('Strong');
          if (isBuySignal) { if (ret > 0.003) wins++; else if (ret < -0.003) losses++; }
          else { if (ret < -0.003) wins++; else if (ret > 0.003) losses++; }
        }
      } catch {}
    }
    if (signals >= 3) {
      results.push({
        name, condition: cond, signals, wins, losses,
        accuracy: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 50,
        avgReturn: Math.round((totalRet / signals) * 10000) / 100,
      });
    }
  }

  return results.sort((a, b) => b.accuracy - a.accuracy);
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

  // Limit candles for performance: max 3000
  const trimmed = candles.length > 3000 ? candles.slice(-3000) : candles;

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

  // ── Grid search per strategy ──
  const SL = [0.01, 0.02, 0.03];
  const TP = [0.02, 0.04, 0.08];
  const results: any[] = [];

  for (const strat of runnable) {
    let bestResult: any = null;
    let bestSL = 0.02;
    let bestTP = 0.04;
    let bestScore = -Infinity;
    let maxTrades = 0;

    for (const sl of SL) {
      for (const tp of TP) {
        if (tp <= sl) continue;
        try {
          const bt = simpleBacktest(trimmed, strat, sl, tp);
          maxTrades = Math.max(maxTrades, bt.totalTrades);
          if (bt.totalTrades < 1) continue;
          const score = bt.maxDrawdown !== 0
            ? (bt.totalReturn / Math.abs(bt.maxDrawdown)) * (bt.winRate / 50)
            : bt.totalReturn;
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
      const grade =
        bestResult.totalReturn > 15 && bestResult.winRate > 55 && bestResult.sharpeRatio > 1 ? 'A' :
        bestResult.totalReturn > 8 && bestResult.winRate > 50 ? 'B' :
        bestResult.totalReturn > 3 && bestResult.winRate > 45 ? 'C' :
        bestResult.totalReturn > 0 ? 'D' : 'F';

      results.push({
        name: strat.name,
        type: strat.type,
        grade,
        totalReturn: bestResult.totalReturn,
        totalTrades: bestResult.totalTrades,
        // Aliases for legacy display fields
        trades: bestResult.totalTrades,
        winRate: bestResult.winRate,
        maxDrawdown: bestResult.maxDrawdown,
        maxDD: Math.abs(bestResult.maxDrawdown),
        sharpeRatio: bestResult.sharpeRatio,
        sharpe: bestResult.sharpeRatio,
        profitFactor: bestResult.profitFactor,
        avgWin: bestResult.avgWin,
        avgLoss: bestResult.avgLoss,
        optimalSL: Math.round(bestSL * 100),
        optimalTP: Math.round(bestTP * 100),
        sl: Math.round(bestSL * 100),
        tp: Math.round(bestTP * 100),
        score: Math.round(bestScore * 100) / 100,
        recommendation: grade === 'A' ? 'STRONG_USE' : grade === 'B' ? 'USE' : grade === 'C' ? 'CAUTION' : grade === 'D' ? 'AVOID' : 'NEVER',
      });
      console.log(`[RND][STRAT] ${strat.name}: trades=${bestResult.totalTrades} return=${bestResult.totalReturn}% wr=${bestResult.winRate}% grade=${grade}`);
    } else {
      // Always include the strategy, even with 0 trades
      results.push({
        name: strat.name,
        type: strat.type,
        grade: 'F',
        totalReturn: 0, totalTrades: 0, trades: 0,
        winRate: 0, maxDrawdown: 0, maxDD: 0,
        sharpeRatio: 0, sharpe: 0, profitFactor: 0,
        avgWin: 0, avgLoss: 0,
        optimalSL: 2, optimalTP: 4, sl: 2, tp: 4,
        score: -999,
        recommendation: 'NEVER — nessun trade generato',
      });
      console.log(`[RND][STRAT] ${strat.name}: NO TRADES (maxAttempted=${maxTrades})`);
    }
  }

  // Sort by totalReturn descending
  results.sort((a, b) => b.totalReturn - a.totalReturn);
  console.log(`[RND][STRAT] === DONE === ${results.length} strategies tested`);
  return results;
}

function generateReport(asset: string, tf: string, behavior: any, indicators: any[], patterns: any[], strategies: any[]) {
  const recommended = strategies.filter((s: any) => s.grade === 'A' || s.grade === 'B').slice(0, 3);
  const avoid = strategies.filter((s: any) => s.grade === 'D' || s.grade === 'F');
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
  if (strategies[0] && topIndicators[0]) {
    keyInsight = `Migliore strategia: ${strategies[0].name} (${strategies[0].totalReturn}% return, ${strategies[0].winRate}% WR). Indicatore più affidabile: ${topIndicators[0].name} ${topIndicators[0].condition} (${topIndicators[0].accuracy}% accuracy).`;
  } else if (strategies[0]) {
    keyInsight = `Migliore strategia: ${strategies[0].name} con ${strategies[0].totalReturn}% return.`;
  } else if (topIndicators[0]) {
    keyInsight = `Nessuna strategia testata. Indicatore più affidabile: ${topIndicators[0].name} ${topIndicators[0].condition} (${topIndicators[0].accuracy}%).`;
  } else {
    keyInsight = 'Analisi incompleta — eseguire tutte le fasi per un rapporto completo.';
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
  if (recommended.length > 0) insights.push(`Strategia raccomandata: ${recommended[0].name} (WR ${recommended[0].winRate}%, Sharpe ${recommended[0].sharpe})`);

  return {
    asset, timeframe: tf, generatedAt: new Date().toISOString(),
    dataAvailable: { behavior: !!behavior, indicators: indicators.length, patterns: patterns.length, strategies: strategies.length },
    summary: { outlook, confidence, keyInsight },
    recommended, avoid, topIndicators, topPatterns,
    tradingSchedule, warnings, insights,
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
        const { candles, source } = await downloadHistory(asset, tf, months);
        if (candles.length < 50) return NextResponse.json({ error: `Solo ${candles.length} candele. Servono almeno 50.` }, { status: 400 });
        const compressed = candles.map(c => [new Date(c.date).getTime(), c.open, c.high, c.low, c.close, c.volume]);
        await redisSet(`nexus:rnd:candles:${asset}:${tf}`, compressed, 604800);
        const from = candles[0].date.slice(0, 10);
        const to = candles[candles.length - 1].date.slice(0, 10);
        return NextResponse.json({ phase: 'download', candles: candles.length, source, from, to, volumeReal: candles.some(c => c.volume > 0) });
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
