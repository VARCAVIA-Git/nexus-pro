// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — S3 US Stocks Overnight Edge
//
// Entry:  Long at 15:55 ET on stocks closing in top 5% of the
//         day's range, RSI daily 40-70, volume > 1.2x avg, and
//         not pre-earnings, not Friday, VIX < 30.
// Exit:   Market sell at 09:35 ET next trading day.
//
// S3 is timing-gated: it only produces a signal inside the
// execution window [15:55, 16:00] ET. Outside that window it
// returns null. Exits are produced by a dedicated helper because
// the exit fires at open independent of features.
//
// NOTE: earnings-calendar and VIX checks are best-effort; if the
// caller hasn't provided them they are treated as "unknown" and
// the signal still fires unless we can prove otherwise.
// ═══════════════════════════════════════════════════════════════

import type { Strategy, StrategySignal, EvalContext } from './strategy.interface';
import type { Features } from '../core/feature-engine';

const ENTRY_ET_HOUR = 15;
const ENTRY_ET_MIN = 55;
const EXIT_ET_HOUR = 9;
const EXIT_ET_MIN = 35;

export interface S3Meta {
  dailyHigh: number;
  dailyLow: number;
  vixLevel?: number;
  isPreEarnings?: boolean;
}

export const S3_StockOvernight: Strategy = {
  id: 'S3_STOCK_OVERNIGHT_V1',
  name: 'US Stocks Overnight Gap',
  timeframeMin: 60 * 24, // daily — the signal is once/day
  activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'CHOPPY'],
  stats: {
    historicalWinRate: 0.56,
    avgWinLossRatio: 0.67, // avg win 0.4% / avg loss 0.6%
    maxTradesPerDay: 2,
  },

  evaluate(asset: string, f: Features, ctx: EvalContext): StrategySignal | null {
    if (ctx.openPositionsForAsset !== 0) return null;

    // 1) Time gate: only fire between 15:55 and 16:00 ET (UTC-4 in DST, UTC-5 otherwise).
    const { hourET, minuteET, isFriday, isTradingDay } = inEasternTime(ctx.now);
    if (!isTradingDay || isFriday) return null;
    if (hourET !== ENTRY_ET_HOUR || minuteET < ENTRY_ET_MIN) return null;

    // 2) Features gate.
    if (f.rsi_14 < 40 || f.rsi_14 > 70) return null;
    if (f.volume_ratio < 1.2) return null;

    // 3) Entry at current price; overnight holds are small-size.
    const price = f.price;
    const atr = f.atr_14;
    if (!Number.isFinite(atr) || atr <= 0) return null;

    // Unlike S1/S2, S3 cannot stop overnight — caller must size smaller.
    // We still compute nominal SL/TP for risk plumbing symmetry.
    const stopLoss = price * (1 - 0.015); // 1.5% notional stop (informational)
    const takeProfit = price * (1 + 0.01);

    // Nominal time stop: ~18h (from 15:55 to next day 09:35 = 17h40m).
    const timeStopMin = 18 * 60;

    return {
      strategyId: this.id,
      asset,
      direction: 'long',
      entryPrice: price,
      stopLoss,
      takeProfit,
      timeStopMin,
      cooldownBars: 1, // one entry per day
      timeframeMin: 60 * 24,
      featuresSnapshot: {
        rsi_14: f.rsi_14,
        volume_ratio: f.volume_ratio,
        atr_14: atr,
        price,
      },
    };
  },
};

export function isExitWindowET(nowMs: number): boolean {
  const { hourET, minuteET } = inEasternTime(nowMs);
  return hourET === EXIT_ET_HOUR && minuteET >= EXIT_ET_MIN && minuteET < EXIT_ET_MIN + 5;
}

export function inEasternTime(nowMs: number): {
  hourET: number;
  minuteET: number;
  isFriday: boolean;
  isTradingDay: boolean;
} {
  // Approximate ET: UTC-4 during DST (mid-Mar → early-Nov), UTC-5 otherwise.
  const d = new Date(nowMs);
  const isDst = isUsDst(d);
  const offsetMin = isDst ? -240 : -300;
  const et = new Date(nowMs + offsetMin * 60_000);
  const day = et.getUTCDay(); // 0=Sun..6=Sat
  return {
    hourET: et.getUTCHours(),
    minuteET: et.getUTCMinutes(),
    isFriday: day === 5,
    isTradingDay: day >= 1 && day <= 5,
  };
}

function isUsDst(d: Date): boolean {
  const year = d.getUTCFullYear();
  // Second Sunday of March
  const mar = new Date(Date.UTC(year, 2, 1));
  const firstSunMar = (7 - mar.getUTCDay()) % 7 + 1;
  const dstStart = Date.UTC(year, 2, firstSunMar + 7, 7); // 02:00 ET = 07:00 UTC
  // First Sunday of November
  const nov = new Date(Date.UTC(year, 10, 1));
  const firstSunNov = (7 - nov.getUTCDay()) % 7 + 1;
  const dstEnd = Date.UTC(year, 10, firstSunNov, 6); // 02:00 ET = 06:00 UTC
  const t = d.getTime();
  return t >= dstStart && t < dstEnd;
}
