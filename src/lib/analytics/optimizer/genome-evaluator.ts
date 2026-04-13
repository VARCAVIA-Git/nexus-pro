// ═══════════════════════════════════════════════════════════════
// Genome Evaluator
//
// Evaluates a StrategyGenome on historical candle data.
// Each active indicator in the genome generates a BUY/SELL/NEUTRAL
// vote. When enough indicators agree (confidence > minConfidence),
// a trade is opened. TP/SL from ATR × genome multipliers.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Indicators } from '@/types';
import type { StrategyGenome, IndicatorGene, GAConfig } from './types';

type Vote = 'BUY' | 'SELL' | 'NEUTRAL';

// ── Signal generators per indicator ──────────────────────────

function voteSMACross(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const fast = gene.params.fast ?? 10;
  const slow = gene.params.slow ?? 50;
  // Use ema9/ema21 as proxy for configurable periods
  const f = ind.ema9[i]; const s = ind.sma50[i];
  if (s === null) return 'NEUTRAL';
  return f > s ? 'BUY' : f < s ? 'SELL' : 'NEUTRAL';
}

function voteEMACross(ind: Indicators, i: number, _gene: IndicatorGene): Vote {
  const f = ind.ema9[i]; const s = ind.ema21[i];
  return f > s ? 'BUY' : f < s ? 'SELL' : 'NEUTRAL';
}

function voteRSI(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const rsi = ind.rsi[i];
  const ob = gene.params.overbought ?? 70;
  const os = gene.params.oversold ?? 30;
  if (rsi < os) return 'BUY';
  if (rsi > ob) return 'SELL';
  return 'NEUTRAL';
}

function voteMACD(ind: Indicators, i: number, _gene: IndicatorGene): Vote {
  const h = ind.macd.histogram[i];
  const hPrev = ind.macd.histogram[Math.max(0, i - 1)];
  if (h > 0 && hPrev <= 0) return 'BUY';
  if (h < 0 && hPrev >= 0) return 'SELL';
  return 'NEUTRAL';
}

function voteBollinger(ind: Indicators, i: number, _gene: IndicatorGene): Vote {
  const close = ind.ema9[i]; // proxy for close
  const lower = ind.bollinger.lower[i];
  const upper = ind.bollinger.upper[i];
  if (lower !== null && close <= lower) return 'BUY';
  if (upper !== null && close >= upper) return 'SELL';
  return 'NEUTRAL';
}

function voteStochastic(ind: Indicators, i: number, _gene: IndicatorGene): Vote {
  const k = ind.stochastic.k[i];
  const d = ind.stochastic.d[i];
  const kPrev = ind.stochastic.k[Math.max(0, i - 1)];
  const dPrev = ind.stochastic.d[Math.max(0, i - 1)];
  if (k < 20 && kPrev < dPrev && k > d) return 'BUY';
  if (k > 80 && kPrev > dPrev && k < d) return 'SELL';
  return 'NEUTRAL';
}

function voteADX(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const adx = ind.adx[i];
  const threshold = gene.params.threshold ?? 25;
  // ADX is a filter, not directional — use EMA for direction
  if (adx > threshold) {
    return ind.ema9[i] > ind.ema21[i] ? 'BUY' : 'SELL';
  }
  return 'NEUTRAL';
}

function voteCCI(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const cci = ind.cci[i];
  const ob = gene.params.overbought ?? 100;
  const os = gene.params.oversold ?? -100;
  if (cci < os) return 'BUY';
  if (cci > ob) return 'SELL';
  return 'NEUTRAL';
}

function voteWilliamsR(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const wr = ind.williamsR[i];
  const ob = gene.params.overbought ?? -20;
  const os = gene.params.oversold ?? -80;
  if (wr < os) return 'BUY';
  if (wr > ob) return 'SELL';
  return 'NEUTRAL';
}

function voteMFI(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const mfi = ind.mfi[i];
  const ob = gene.params.overbought ?? 80;
  const os = gene.params.oversold ?? 20;
  if (mfi < os) return 'BUY';
  if (mfi > ob) return 'SELL';
  return 'NEUTRAL';
}

function votePSAR(ind: Indicators, i: number, _gene: IndicatorGene, candles: OHLCV[]): Vote {
  const psar = ind.psar[i];
  if (psar === 0) return 'NEUTRAL';
  return candles[i].close > psar ? 'BUY' : 'SELL';
}

function voteIchimoku(ind: Indicators, i: number, _gene: IndicatorGene, candles: OHLCV[]): Vote {
  const close = candles[i].close;
  const sA = ind.ichimoku.senkouA[i];
  const sB = ind.ichimoku.senkouB[i];
  if (sA === 0 || sB === 0) return 'NEUTRAL';
  const cloudTop = Math.max(sA, sB);
  const cloudBottom = Math.min(sA, sB);
  if (close > cloudTop) return 'BUY';
  if (close < cloudBottom) return 'SELL';
  return 'NEUTRAL';
}

function voteKeltner(ind: Indicators, i: number, _gene: IndicatorGene, candles: OHLCV[]): Vote {
  const close = candles[i].close;
  if (close > ind.keltner.upper[i]) return 'BUY';
  if (close < ind.keltner.lower[i]) return 'SELL';
  return 'NEUTRAL';
}

function voteSqueezeMom(ind: Indicators, i: number, _gene: IndicatorGene): Vote {
  const mom = ind.squeezeMom[i];
  const momPrev = ind.squeezeMom[Math.max(0, i - 1)];
  if (mom > 0 && momPrev <= 0) return 'BUY';
  if (mom < 0 && momPrev >= 0) return 'SELL';
  return 'NEUTRAL';
}

function voteCMF(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const cmf = ind.cmf[i];
  const t = gene.params.threshold ?? 0.1;
  if (cmf > t) return 'BUY';
  if (cmf < -t) return 'SELL';
  return 'NEUTRAL';
}

function voteOBVTrend(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const period = gene.params.period ?? 20;
  if (i < period) return 'NEUTRAL';
  const obvNow = ind.obv[i];
  const obvPast = ind.obv[i - period];
  return obvNow > obvPast ? 'BUY' : obvNow < obvPast ? 'SELL' : 'NEUTRAL';
}

function voteVWAP(ind: Indicators, i: number, _gene: IndicatorGene, candles: OHLCV[]): Vote {
  const vwap = ind.vwap[i];
  if (vwap === 0) return 'NEUTRAL';
  return candles[i].close > vwap ? 'BUY' : 'SELL';
}

function voteVolumeSpike(ind: Indicators, i: number, gene: IndicatorGene): Vote {
  const threshold = gene.params.threshold ?? 1.5;
  const avg = ind.volume.avg20[i];
  if (avg === 0) return 'NEUTRAL';
  return ind.volume.raw[i] > avg * threshold ? 'BUY' : 'NEUTRAL'; // Volume spike = confirmation, not directional
}

function voteSuperTrend(ind: Indicators, i: number, _gene: IndicatorGene, candles: OHLCV[]): Vote {
  // Approximate SuperTrend using PSAR + ATR direction
  const atr = ind.atr[i];
  const close = candles[i].close;
  const ema = ind.ema21[i];
  if (close > ema + atr) return 'BUY';
  if (close < ema - atr) return 'SELL';
  return 'NEUTRAL';
}

// ── Vote dispatcher ──────────────────────────────────────────

const VOTE_FNS: Record<string, (ind: Indicators, i: number, gene: IndicatorGene, candles: OHLCV[]) => Vote> = {
  sma_cross: (ind, i, gene) => voteSMACross(ind, i, gene),
  ema_cross: (ind, i, gene) => voteEMACross(ind, i, gene),
  rsi: (ind, i, gene) => voteRSI(ind, i, gene),
  macd: (ind, i, gene) => voteMACD(ind, i, gene),
  bollinger: (ind, i, gene) => voteBollinger(ind, i, gene),
  stochastic: (ind, i, gene) => voteStochastic(ind, i, gene),
  adx: (ind, i, gene) => voteADX(ind, i, gene),
  cci: (ind, i, gene) => voteCCI(ind, i, gene),
  williamsR: (ind, i, gene) => voteWilliamsR(ind, i, gene),
  mfi: (ind, i, gene) => voteMFI(ind, i, gene),
  psar: votePSAR,
  ichimoku: voteIchimoku,
  keltner: voteKeltner,
  squeezeMom: (ind, i, gene) => voteSqueezeMom(ind, i, gene),
  cmf: (ind, i, gene) => voteCMF(ind, i, gene),
  obv_trend: (ind, i, gene) => voteOBVTrend(ind, i, gene),
  vwap: voteVWAP,
  volume_spike: (ind, i, gene) => voteVolumeSpike(ind, i, gene),
  supertrend: voteSuperTrend,
};

// ── Main evaluator ───────────────────────────────────────────

/**
 * Evaluate a genome on candle data. Fills genome fields
 * (winRate, profitFactor, sharpe, calmar, totalTrades, etc.)
 */
export function evaluateGenome(
  genome: StrategyGenome,
  candles: OHLCV[],
  indicators: Indicators,
  config: GAConfig,
): void {
  const trades: number[] = []; // P&L per trade as fraction
  const equity: number[] = [1];
  let openSide: 'BUY' | 'SELL' | null = null;
  let openPrice = 0;
  let openBar = 0;
  let stopLoss = 0;
  let takeProfit = 0;
  let peakPrice = 0;

  const activeIndicators = Object.entries(genome.indicators)
    .filter(([_, gene]) => (gene as IndicatorGene).active);

  if (activeIndicators.length < 2) {
    genome.totalTrades = 0;
    genome.winRate = 0;
    genome.profitFactor = 0;
    genome.sharpe = 0;
    genome.calmar = 0;
    genome.netProfitPct = 0;
    genome.maxDrawdownPct = 0;
    return;
  }

  for (let i = 60; i < candles.length; i++) {
    const price = candles[i].close;
    const atr = indicators.atr[i] || price * 0.02;

    // Check exit conditions for open position
    if (openSide) {
      let exit = false;
      if (openSide === 'BUY') {
        peakPrice = Math.max(peakPrice, candles[i].high);
        if (candles[i].low <= stopLoss) exit = true;
        if (candles[i].high >= takeProfit) exit = true;
        // Trailing stop
        if (genome.trailingStopPct > 0) {
          const trailStop = peakPrice * (1 - genome.trailingStopPct / 100);
          if (trailStop > stopLoss) stopLoss = trailStop;
        }
      } else {
        peakPrice = Math.min(peakPrice, candles[i].low);
        if (candles[i].high >= stopLoss) exit = true;
        if (candles[i].low <= takeProfit) exit = true;
        if (genome.trailingStopPct > 0) {
          const trailStop = peakPrice * (1 + genome.trailingStopPct / 100);
          if (trailStop < stopLoss) stopLoss = trailStop;
        }
      }
      // Timeout: 100 bars max
      if (i - openBar >= 100) exit = true;

      if (exit) {
        const mult = openSide === 'BUY' ? 1 : -1;
        const ret = (price - openPrice) / openPrice * mult;
        trades.push(ret);
        equity.push(equity[equity.length - 1] * (1 + ret));
        openSide = null;
      }
      continue; // Don't open new position while one is open
    }

    // Generate signal from genome
    let buyVotes = 0;
    let sellVotes = 0;
    let totalVotes = 0;

    for (const [name, gene] of activeIndicators) {
      const voteFn = VOTE_FNS[name];
      if (!voteFn) continue;
      const vote = voteFn(indicators, i, gene as IndicatorGene, candles);
      totalVotes++;
      if (vote === 'BUY') buyVotes++;
      else if (vote === 'SELL') sellVotes++;
    }

    if (totalVotes === 0) continue;

    const buyConf = buyVotes / totalVotes;
    const sellConf = sellVotes / totalVotes;

    if (buyConf >= genome.minConfidence && buyVotes >= 2) {
      openSide = 'BUY';
      openPrice = price;
      openBar = i;
      stopLoss = price - atr * genome.slAtrMultiplier;
      takeProfit = price + atr * genome.tpAtrMultiplier;
      peakPrice = price;
    } else if (sellConf >= genome.minConfidence && sellVotes >= 2) {
      openSide = 'SELL';
      openPrice = price;
      openBar = i;
      stopLoss = price + atr * genome.slAtrMultiplier;
      takeProfit = price - atr * genome.tpAtrMultiplier;
      peakPrice = price;
    }
  }

  // Calculate metrics
  genome.totalTrades = trades.length;
  if (trades.length < config.minTrades) {
    genome.winRate = 0;
    genome.profitFactor = 0;
    genome.sharpe = 0;
    genome.calmar = 0;
    genome.netProfitPct = 0;
    genome.maxDrawdownPct = 0;
    return;
  }

  const wins = trades.filter(t => t > 0);
  const losses = trades.filter(t => t <= 0);
  genome.winRate = (wins.length / trades.length) * 100;

  const grossWin = wins.reduce((s, t) => s + t, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t, 0));
  genome.profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  genome.netProfitPct = ((equity[equity.length - 1] - 1) * 100);

  // Max drawdown
  let peak = equity[0];
  let maxDD = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = (peak - e) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  genome.maxDrawdownPct = maxDD * 100;

  // Sharpe
  const avgRet = trades.reduce((a, b) => a + b, 0) / trades.length;
  const stdDev = trades.length > 1
    ? Math.sqrt(trades.reduce((a, r) => a + (r - avgRet) ** 2, 0) / (trades.length - 1))
    : 0;
  genome.sharpe = stdDev > 0 ? (avgRet / stdDev) * Math.sqrt(trades.length) : 0;

  // Calmar
  genome.calmar = genome.maxDrawdownPct > 0 ? genome.netProfitPct / genome.maxDrawdownPct : 0;
}
