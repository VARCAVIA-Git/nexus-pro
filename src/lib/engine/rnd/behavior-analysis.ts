// ═══════════════════════════════════════════════════════════════
// Deep Behavior Analysis — comprehensive statistical profiling
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';

export interface BehaviorAnalysis {
  summary: { totalCandles: number; periodDays: number; avgDailyReturn: number; avgDailyVolatility: number; maxDailyGain: number; maxDailyLoss: number; overallTrend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS'; trendStrength: number };
  hourly: { hour: number; avgReturn: number; volatility: number; winRate: number; avgVolume: number; sampleSize: number; rating: string }[];
  daily: { day: number; dayName: string; avgReturn: number; winRate: number; volatility: number; sampleSize: number; rating: string }[];
  volatility: { currentATR: number; avgATR: number; atrTrend: string; highVolHours: number[]; lowVolHours: number[] };
  reactions: {
    afterBigUp2pct: { count: number; avgNext1h: number; avgNext4h: number; continuationRate: number };
    afterBigDown2pct: { count: number; avgNext1h: number; avgNext4h: number; bounceRate: number };
    afterBigUp5pct: { count: number; avgNext1h: number; avgNext4h: number; continuationRate: number };
    afterBigDown5pct: { count: number; avgNext1h: number; avgNext4h: number; bounceRate: number };
  };
  ranges: { avgCandleRange: number; percentile95Range: number };
  keyLevels: { price: number; type: 'support' | 'resistance'; touches: number; strength: number }[];
  bestTradingWindows: { description: string; avgReturn: number; winRate: number; sampleSize: number }[];
  worstTradingWindows: { description: string; avgReturn: number; winRate: number; sampleSize: number }[];
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function rate(wr: number): string {
  if (wr > 60) return 'EXCELLENT';
  if (wr > 55) return 'GOOD';
  if (wr < 40) return 'AVOID';
  if (wr < 45) return 'BAD';
  return 'NEUTRAL';
}

function avg(arr: number[]): number { return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function std(arr: number[]): number { const m = avg(arr); return arr.length > 1 ? Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) : 0; }

export function analyzeBehavior(candles: OHLCV[]): BehaviorAnalysis {
  const n = candles.length;

  // Summary
  const returns = candles.map(c => c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0);
  const firstPrice = candles[0]?.open ?? 0;
  const lastPrice = candles[n - 1]?.close ?? 0;
  const totalChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

  const summary = {
    totalCandles: n,
    periodDays: n > 1 ? Math.round((new Date(candles[n - 1].date).getTime() - new Date(candles[0].date).getTime()) / 86400000) : 0,
    avgDailyReturn: Math.round(avg(returns) * 1000) / 1000,
    avgDailyVolatility: Math.round(std(returns) * 1000) / 1000,
    maxDailyGain: Math.round(Math.max(...returns) * 100) / 100,
    maxDailyLoss: Math.round(Math.min(...returns) * 100) / 100,
    overallTrend: (totalChange > 5 ? 'BULLISH' : totalChange < -5 ? 'BEARISH' : 'SIDEWAYS') as 'BULLISH' | 'BEARISH' | 'SIDEWAYS',
    trendStrength: Math.min(Math.round(Math.abs(totalChange)), 100),
  };

  // Hourly
  const hBuckets: Record<number, { returns: number[]; vols: number[]; greens: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hBuckets[h] = { returns: [], vols: [], greens: 0, total: 0 };

  for (const c of candles) {
    const dt = new Date(c.date);
    if (isNaN(dt.getTime())) continue;
    const h = dt.getUTCHours();
    const ret = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    hBuckets[h].returns.push(ret);
    hBuckets[h].vols.push(c.volume);
    if (ret > 0) hBuckets[h].greens++;
    hBuckets[h].total++;
  }

  const hourly = Object.entries(hBuckets).map(([h, b]) => {
    const wr = b.total > 0 ? (b.greens / b.total) * 100 : 50;
    return {
      hour: +h, avgReturn: Math.round(avg(b.returns) * 1000) / 1000,
      volatility: Math.round(std(b.returns) * 1000) / 1000,
      winRate: Math.round(wr), avgVolume: Math.round(avg(b.vols)),
      sampleSize: b.total, rating: rate(wr),
    };
  });

  // Daily
  const dBuckets: Record<number, { returns: number[]; greens: number; total: number }> = {};
  for (let d = 0; d < 7; d++) dBuckets[d] = { returns: [], greens: 0, total: 0 };
  for (const c of candles) {
    const dt = new Date(c.date);
    if (isNaN(dt.getTime())) continue;
    const d = dt.getUTCDay();
    const ret = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    dBuckets[d].returns.push(ret);
    if (ret > 0) dBuckets[d].greens++;
    dBuckets[d].total++;
  }

  const daily = Object.entries(dBuckets).map(([d, b]) => {
    const wr = b.total > 0 ? (b.greens / b.total) * 100 : 50;
    return {
      day: +d, dayName: DAY_NAMES[+d], avgReturn: Math.round(avg(b.returns) * 1000) / 1000,
      winRate: Math.round(wr), volatility: Math.round(std(b.returns) * 1000) / 1000,
      sampleSize: b.total, rating: rate(wr),
    };
  });

  // Volatility
  const candleRanges = candles.map(c => c.open > 0 ? ((c.high - c.low) / c.open) * 100 : 0);
  const avgATR = avg(candleRanges);
  const currentATR = candleRanges.length > 14 ? avg(candleRanges.slice(-14)) : avgATR;
  const prevATR = candleRanges.length > 28 ? avg(candleRanges.slice(-28, -14)) : avgATR;
  const hourlyVols = hourly.map(h => h.volatility);
  const avgHourlyVol = avg(hourlyVols);

  const volatility = {
    currentATR: Math.round(currentATR * 1000) / 1000,
    avgATR: Math.round(avgATR * 1000) / 1000,
    atrTrend: currentATR > prevATR * 1.1 ? 'INCREASING' : currentATR < prevATR * 0.9 ? 'DECREASING' : 'STABLE',
    highVolHours: hourly.filter(h => h.volatility > avgHourlyVol * 1.5 && h.sampleSize >= 3).map(h => h.hour),
    lowVolHours: hourly.filter(h => h.volatility < avgHourlyVol * 0.5 && h.sampleSize >= 3).map(h => h.hour),
  };

  // Reactions
  function measureReaction(threshold: number) {
    let count = 0, sum1 = 0, sum4 = 0, cont = 0;
    for (let i = 0; i < n - 4; i++) {
      const ret = candles[i].open > 0 ? ((candles[i].close - candles[i].open) / candles[i].open) * 100 : 0;
      const isUp = threshold > 0 ? ret > threshold : ret < threshold;
      if (isUp) {
        count++;
        const r1 = candles[i].close > 0 ? ((candles[i + 1].close - candles[i].close) / candles[i].close) * 100 : 0;
        const r4 = candles[i].close > 0 ? ((candles[Math.min(i + 4, n - 1)].close - candles[i].close) / candles[i].close) * 100 : 0;
        sum1 += r1; sum4 += r4;
        if (threshold > 0 ? r1 > 0 : r1 > 0) cont++; // continuation for up, bounce for down
      }
    }
    return { count, avgNext1h: count > 0 ? Math.round((sum1 / count) * 1000) / 1000 : 0, avgNext4h: count > 0 ? Math.round((sum4 / count) * 1000) / 1000 : 0, rate: count > 0 ? Math.round((cont / count) * 100) : 0 };
  }

  const ru2 = measureReaction(2); const ru5 = measureReaction(5);
  const rd2 = measureReaction(-2); const rd5 = measureReaction(-5);

  const reactions = {
    afterBigUp2pct: { count: ru2.count, avgNext1h: ru2.avgNext1h, avgNext4h: ru2.avgNext4h, continuationRate: ru2.rate },
    afterBigUp5pct: { count: ru5.count, avgNext1h: ru5.avgNext1h, avgNext4h: ru5.avgNext4h, continuationRate: ru5.rate },
    afterBigDown2pct: { count: rd2.count, avgNext1h: rd2.avgNext1h, avgNext4h: rd2.avgNext4h, bounceRate: rd2.rate },
    afterBigDown5pct: { count: rd5.count, avgNext1h: rd5.avgNext1h, avgNext4h: rd5.avgNext4h, bounceRate: rd5.rate },
  };

  // Ranges
  const sorted = [...candleRanges].sort((a, b) => a - b);
  const ranges = {
    avgCandleRange: Math.round(avgATR * 1000) / 1000,
    percentile95Range: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length * 0.95)] * 1000) / 1000 : 0,
  };

  // Key levels (pivot point clustering)
  const priceLevels: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low && candles[i].low < candles[i - 2].low && candles[i].low < candles[i + 2].low)
      priceLevels.push(candles[i].low);
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high && candles[i].high > candles[i - 2].high && candles[i].high > candles[i + 2].high)
      priceLevels.push(candles[i].high);
  }

  // Cluster nearby levels
  const clusters: { price: number; touches: number; type: 'support' | 'resistance' }[] = [];
  const used = new Set<number>();
  for (const lvl of priceLevels) {
    if (used.has(lvl)) continue;
    const nearby = priceLevels.filter(p => Math.abs(p - lvl) / lvl < 0.005);
    nearby.forEach(p => used.add(p));
    const avgPrice = avg(nearby);
    const isSup = nearby.every(p => candles.some(c => c.low <= p * 1.003 && c.low >= p * 0.997));
    clusters.push({ price: Math.round(avgPrice * 100) / 100, touches: nearby.length, type: isSup ? 'support' : 'resistance' });
  }

  const keyLevels = clusters.filter(c => c.touches >= 2).sort((a, b) => b.touches - a.touches).slice(0, 8).map(c => ({ ...c, strength: Math.min(c.touches * 20, 100) }));

  // Best/worst trading windows (hour+day combos)
  const windows: Record<string, { returns: number[]; greens: number; total: number }> = {};
  for (const c of candles) {
    const dt = new Date(c.date);
    if (isNaN(dt.getTime())) continue;
    const h = dt.getUTCHours();
    const d = dt.getUTCDay();
    const key = `${DAY_NAMES[d]} ${h}:00-${h + 1}:00 UTC`;
    if (!windows[key]) windows[key] = { returns: [], greens: 0, total: 0 };
    const ret = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    windows[key].returns.push(ret);
    if (ret > 0) windows[key].greens++;
    windows[key].total++;
  }

  const windowStats = Object.entries(windows).filter(([, b]) => b.total >= 5).map(([desc, b]) => ({
    description: desc, avgReturn: Math.round(avg(b.returns) * 1000) / 1000,
    winRate: Math.round((b.greens / b.total) * 100), sampleSize: b.total,
  }));

  const bestTradingWindows = windowStats.filter(w => w.winRate > 60).sort((a, b) => b.winRate - a.winRate).slice(0, 5);
  const worstTradingWindows = windowStats.filter(w => w.winRate < 40).sort((a, b) => a.winRate - b.winRate).slice(0, 5);

  return { summary, hourly, daily, volatility, reactions, ranges, keyLevels, bestTradingWindows, worstTradingWindows };
}
