// ═══════════════════════════════════════════════════════════════
// Asset Behavior Profile — statistical analysis of how an asset behaves
// by hour, day, and after momentum events
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';

export interface AssetProfile {
  asset: string;
  timeframe: string;
  generatedAt: string;
  totalCandles: number;

  hourlyBehavior: {
    hour: number;
    avgReturn: number;
    volatility: number;
    winRateLong: number;
    sampleSize: number;
  }[];

  dailyBehavior: {
    day: number;
    avgReturn: number;
    winRateLong: number;
    sampleSize: number;
  }[];

  momentumProfile: {
    afterBigUp: { avgReturn1h: number; avgReturn4h: number; continuationRate: number; count: number };
    afterBigDown: { avgReturn1h: number; avgReturn4h: number; bounceRate: number; count: number };
  };

  bestIndicators: { name: string; accuracy: number }[];
  bestStrategy: { name: string; winRate: number; returnPct: number };
  avoidHours: number[];
  bestHours: number[];
}

export function generateAssetProfile(candles: OHLCV[], asset: string, timeframe: string): AssetProfile {
  const profile: AssetProfile = {
    asset, timeframe,
    generatedAt: new Date().toISOString(),
    totalCandles: candles.length,
    hourlyBehavior: [],
    dailyBehavior: [],
    momentumProfile: {
      afterBigUp: { avgReturn1h: 0, avgReturn4h: 0, continuationRate: 0, count: 0 },
      afterBigDown: { avgReturn1h: 0, avgReturn4h: 0, bounceRate: 0, count: 0 },
    },
    bestIndicators: [],
    bestStrategy: { name: '', winRate: 0, returnPct: 0 },
    avoidHours: [],
    bestHours: [],
  };

  if (candles.length < 20) return profile;

  // ── Hourly behavior ─────────────────────────────────────
  const hourBuckets = new Map<number, { returns: number[]; greens: number; total: number }>();
  for (let h = 0; h < 24; h++) hourBuckets.set(h, { returns: [], greens: 0, total: 0 });

  for (const c of candles) {
    const d = new Date(c.date);
    if (isNaN(d.getTime())) continue;
    const hour = d.getUTCHours();
    const ret = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    const bucket = hourBuckets.get(hour)!;
    bucket.returns.push(ret);
    if (c.close > c.open) bucket.greens++;
    bucket.total++;
  }

  for (const [hour, b] of hourBuckets) {
    if (b.total === 0) { profile.hourlyBehavior.push({ hour, avgReturn: 0, volatility: 0, winRateLong: 50, sampleSize: 0 }); continue; }
    const avg = b.returns.reduce((s, r) => s + r, 0) / b.returns.length;
    const variance = b.returns.reduce((s, r) => s + (r - avg) ** 2, 0) / b.returns.length;
    profile.hourlyBehavior.push({
      hour, avgReturn: Math.round(avg * 1000) / 1000,
      volatility: Math.round(Math.sqrt(variance) * 1000) / 1000,
      winRateLong: Math.round((b.greens / b.total) * 100 * 10) / 10,
      sampleSize: b.total,
    });
  }

  // ── Daily behavior ──────────────────────────────────────
  const dayBuckets = new Map<number, { returns: number[]; greens: number; total: number }>();
  for (let d = 0; d < 7; d++) dayBuckets.set(d, { returns: [], greens: 0, total: 0 });

  for (const c of candles) {
    const d = new Date(c.date);
    if (isNaN(d.getTime())) continue;
    const day = d.getUTCDay();
    const ret = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    const bucket = dayBuckets.get(day)!;
    bucket.returns.push(ret);
    if (c.close > c.open) bucket.greens++;
    bucket.total++;
  }

  for (const [day, b] of dayBuckets) {
    const avg = b.returns.length > 0 ? b.returns.reduce((s, r) => s + r, 0) / b.returns.length : 0;
    profile.dailyBehavior.push({
      day, avgReturn: Math.round(avg * 1000) / 1000,
      winRateLong: b.total > 0 ? Math.round((b.greens / b.total) * 100 * 10) / 10 : 50,
      sampleSize: b.total,
    });
  }

  // ── Momentum profile ────────────────────────────────────
  let bigUpCount = 0, bigDownCount = 0;
  let bigUpRet1h = 0, bigUpRet4h = 0, bigUpCont = 0;
  let bigDownRet1h = 0, bigDownRet4h = 0, bigDownBounce = 0;

  for (let i = 0; i < candles.length - 4; i++) {
    const ret = candles[i].open > 0 ? ((candles[i].close - candles[i].open) / candles[i].open) * 100 : 0;

    if (ret > 2) {
      bigUpCount++;
      const r1 = candles[i].close > 0 ? ((candles[i + 1].close - candles[i].close) / candles[i].close) * 100 : 0;
      const r4 = candles[i].close > 0 ? ((candles[i + 4].close - candles[i].close) / candles[i].close) * 100 : 0;
      bigUpRet1h += r1;
      bigUpRet4h += r4;
      if (r1 > 0) bigUpCont++;
    }

    if (ret < -2) {
      bigDownCount++;
      const r1 = candles[i].close > 0 ? ((candles[i + 1].close - candles[i].close) / candles[i].close) * 100 : 0;
      const r4 = candles[i].close > 0 ? ((candles[i + 4].close - candles[i].close) / candles[i].close) * 100 : 0;
      bigDownRet1h += r1;
      bigDownRet4h += r4;
      if (r1 > 0) bigDownBounce++;
    }
  }

  profile.momentumProfile = {
    afterBigUp: {
      avgReturn1h: bigUpCount > 0 ? Math.round((bigUpRet1h / bigUpCount) * 1000) / 1000 : 0,
      avgReturn4h: bigUpCount > 0 ? Math.round((bigUpRet4h / bigUpCount) * 1000) / 1000 : 0,
      continuationRate: bigUpCount > 0 ? Math.round((bigUpCont / bigUpCount) * 100) : 0,
      count: bigUpCount,
    },
    afterBigDown: {
      avgReturn1h: bigDownCount > 0 ? Math.round((bigDownRet1h / bigDownCount) * 1000) / 1000 : 0,
      avgReturn4h: bigDownCount > 0 ? Math.round((bigDownRet4h / bigDownCount) * 1000) / 1000 : 0,
      bounceRate: bigDownCount > 0 ? Math.round((bigDownBounce / bigDownCount) * 100) : 0,
      count: bigDownCount,
    },
  };

  // ── Best/avoid hours ────────────────────────────────────
  profile.avoidHours = profile.hourlyBehavior
    .filter(h => h.winRateLong < 45 && h.sampleSize >= 5)
    .map(h => h.hour);

  profile.bestHours = profile.hourlyBehavior
    .filter(h => h.winRateLong > 58 && h.sampleSize >= 5)
    .map(h => h.hour);

  return profile;
}
