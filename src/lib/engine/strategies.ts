import type {
  OHLCV, Indicators, Signal, SignalResult, StrategyKey, Regime,
  StrategyDecision, ExitDecision, Position,
} from '@/types';
import { detectRegime } from './indicators';
import { detectPatterns, patternScore } from './patterns';

// ═══════════════════════════════════════════════════════════════
// Strategy Interface — each strategy implements 3 functions
// ═══════════════════════════════════════════════════════════════

export interface Strategy {
  shouldEnter(candles: OHLCV[], ind: Indicators, i: number): StrategyDecision;
  shouldExit(pos: Position, candles: OHLCV[], ind: Indicators, i: number): ExitDecision;
  calculateSize(capital: number, riskPct: number, atr: number, price: number): number;
}

// ═══════════════════════════════════════════════════════════════
// 1. TREND FOLLOWING
// EMA21 > SMA50, ADX > 25, MACD positive. Exit on 2 closes below EMA21.
// ═══════════════════════════════════════════════════════════════

const trendFollowing: Strategy = {
  shouldEnter(candles, ind, i) {
    const ema21 = ind.ema21[i];
    const sma50 = ind.sma50[i];
    const adx = ind.adx[i];
    const macdH = ind.macd.histogram[i];
    const close = candles[i].close;

    if (sma50 === null) return { enter: false, side: 'LONG', confidence: 0 };

    // Long: EMA21 > SMA50 + ADX > 25 + MACD positive + close > EMA21
    if (ema21 > sma50 && adx > 25 && macdH > 0 && close > ema21) {
      const conf = Math.min(0.5 + (adx - 25) / 50 + Math.min(macdH / close * 100, 0.2), 0.95);
      return { enter: true, side: 'LONG', confidence: conf };
    }

    // Short: EMA21 < SMA50 + ADX > 25 + MACD negative + close < EMA21
    if (ema21 < sma50 && adx > 25 && macdH < 0 && close < ema21) {
      const conf = Math.min(0.5 + (adx - 25) / 50 + Math.min(Math.abs(macdH) / close * 100, 0.2), 0.95);
      return { enter: true, side: 'SHORT', confidence: conf };
    }

    return { enter: false, side: 'LONG', confidence: 0 };
  },

  shouldExit(pos, candles, ind, i) {
    const ema21 = ind.ema21[i];
    const close = candles[i].close;
    const barsBelow = pos.barsBelowEma21 ?? 0;

    if (pos.side === 'LONG' && close < ema21) {
      if (barsBelow >= 1) return { exit: true, reason: 'close_below_ema21_2bars' };
      pos.barsBelowEma21 = barsBelow + 1;
    } else if (pos.side === 'SHORT' && close > ema21) {
      if (barsBelow >= 1) return { exit: true, reason: 'close_above_ema21_2bars' };
      pos.barsBelowEma21 = barsBelow + 1;
    } else {
      pos.barsBelowEma21 = 0;
    }

    return { exit: false, reason: '' };
  },

  calculateSize(capital, riskPct, atr, price) {
    const riskAmount = capital * (riskPct / 100);
    const stopDist = atr * 2;
    return stopDist > 0 ? Math.min(riskAmount / stopDist, capital * 0.25 / price) : 0;
  },
};

// ═══════════════════════════════════════════════════════════════
// 2. MEAN REVERSION
// RSI < 30 + BB lower touch + volume spike → BUY. Exit RSI > 50.
// ═══════════════════════════════════════════════════════════════

const meanReversion: Strategy = {
  shouldEnter(candles, ind, i) {
    const rsi = ind.rsi[i];
    const close = candles[i].close;
    const bbLower = ind.bollinger.lower[i];
    const bbUpper = ind.bollinger.upper[i];
    const volSpike = ind.volume.spike[i];

    // Long: RSI oversold + touch lower band + volume confirmation
    if (rsi < 30 && bbLower !== null && close <= bbLower * 1.005 && volSpike) {
      const conf = Math.min(0.6 + (30 - rsi) / 60 + 0.1, 0.9);
      return { enter: true, side: 'LONG', confidence: conf };
    }

    // Short: RSI overbought + touch upper band + volume confirmation
    if (rsi > 70 && bbUpper !== null && close >= bbUpper * 0.995 && volSpike) {
      const conf = Math.min(0.6 + (rsi - 70) / 60 + 0.1, 0.9);
      return { enter: true, side: 'SHORT', confidence: conf };
    }

    return { enter: false, side: 'LONG', confidence: 0 };
  },

  shouldExit(pos, _candles, ind, i) {
    const rsi = ind.rsi[i];
    if (pos.side === 'LONG' && rsi > 50) return { exit: true, reason: 'rsi_above_50' };
    if (pos.side === 'SHORT' && rsi < 50) return { exit: true, reason: 'rsi_below_50' };
    return { exit: false, reason: '' };
  },

  calculateSize(capital, riskPct, atr, price) {
    const riskAmount = capital * (riskPct / 100);
    const stopDist = atr * 1.5;
    return stopDist > 0 ? Math.min(riskAmount / stopDist, capital * 0.2 / price) : 0;
  },
};

// ═══════════════════════════════════════════════════════════════
// 3. BREAKOUT
// Break 20-period high + volume > 1.5x avg + ADX rising. Fixed -8% stop.
// ═══════════════════════════════════════════════════════════════

const breakoutStrategy: Strategy = {
  shouldEnter(candles, ind, i) {
    if (i < 20) return { enter: false, side: 'LONG', confidence: 0 };

    const close = candles[i].close;
    const vol = candles[i].volume;
    const adx = ind.adx[i];
    const adxPrev = ind.adx[Math.max(0, i - 3)] ?? 0;

    let high20 = -Infinity;
    let low20 = Infinity;
    let avgVol = 0;
    for (let j = i - 20; j < i; j++) {
      high20 = Math.max(high20, candles[j].high);
      low20 = Math.min(low20, candles[j].low);
      avgVol += candles[j].volume;
    }
    avgVol /= 20;

    const volSpike = avgVol > 0 ? vol / avgVol : 1;
    const adxRising = adx > adxPrev;

    // Long breakout
    if (close > high20 && volSpike > 1.5 && adxRising) {
      const conf = Math.min(0.55 + (volSpike - 1.5) / 5 + (adx > 25 ? 0.15 : 0), 0.9);
      return { enter: true, side: 'LONG', confidence: conf };
    }

    // Short breakout
    if (close < low20 && volSpike > 1.5 && adxRising) {
      const conf = Math.min(0.55 + (volSpike - 1.5) / 5 + (adx > 25 ? 0.15 : 0), 0.9);
      return { enter: true, side: 'SHORT', confidence: conf };
    }

    return { enter: false, side: 'LONG', confidence: 0 };
  },

  shouldExit(pos, candles, _ind, i) {
    const price = candles[i].close;
    const entryPrice = pos.entryPrice;

    // Fixed -8% stop
    if (pos.side === 'LONG' && price < entryPrice * 0.92) {
      return { exit: true, reason: 'fixed_stop_8pct' };
    }
    if (pos.side === 'SHORT' && price > entryPrice * 1.08) {
      return { exit: true, reason: 'fixed_stop_8pct' };
    }
    return { exit: false, reason: '' };
  },

  calculateSize(capital, riskPct, atr, price) {
    if (atr <= 0 || price <= 0) return 0;
    // Risk is fixed at 8% of position, so size = riskAmount / (price * 0.08)
    const riskAmount = capital * (riskPct / 100);
    return Math.min(riskAmount / (price * 0.08), capital * 0.3 / price);
  },
};

// ═══════════════════════════════════════════════════════════════
// 4. ADAPTIVE MOMENTUM
// RSI > 50 + MACD cross up + Stochastic cross up. Trailing 2x ATR.
// ═══════════════════════════════════════════════════════════════

const adaptiveMomentum: Strategy = {
  shouldEnter(candles, ind, i) {
    if (i < 2) return { enter: false, side: 'LONG', confidence: 0 };

    const rsi = ind.rsi[i];
    const macdH = ind.macd.histogram[i];
    const macdHPrev = ind.macd.histogram[i - 1];
    const stochK = ind.stochastic.k[i];
    const stochD = ind.stochastic.d[i];
    const stochKPrev = ind.stochastic.k[i - 1];
    const stochDPrev = ind.stochastic.d[i - 1];

    // MACD cross up = histogram was negative, now positive
    const macdCrossUp = macdHPrev < 0 && macdH > 0;
    const macdCrossDown = macdHPrev > 0 && macdH < 0;

    // Stochastic cross up = %K crosses above %D
    const stochCrossUp = stochKPrev < stochDPrev && stochK > stochD;
    const stochCrossDown = stochKPrev > stochDPrev && stochK < stochD;

    // Long: RSI > 50 + MACD cross up + Stochastic cross up
    if (rsi > 50 && macdCrossUp && stochCrossUp) {
      const conf = Math.min(0.6 + (rsi - 50) / 100, 0.9);
      return { enter: true, side: 'LONG', confidence: conf };
    }

    // Short: RSI < 50 + MACD cross down + Stochastic cross down
    if (rsi < 50 && macdCrossDown && stochCrossDown) {
      const conf = Math.min(0.6 + (50 - rsi) / 100, 0.9);
      return { enter: true, side: 'SHORT', confidence: conf };
    }

    return { enter: false, side: 'LONG', confidence: 0 };
  },

  shouldExit(pos, candles, ind, i) {
    // Trailing stop at 2x ATR from the highest price since entry
    const atr = ind.atr[i];
    const trailDist = atr * 2;
    const price = candles[i].close;

    if (pos.side === 'LONG') {
      const trailStop = price - trailDist;
      // Check if current stop should trigger
      if (price < pos.stopLoss) {
        return { exit: true, reason: 'trailing_stop_2atr' };
      }
      // Update trailing stop
      const newStop = Math.max(pos.stopLoss, trailStop);
      pos.stopLoss = newStop;
    } else {
      const trailStop = price + trailDist;
      if (price > pos.stopLoss) {
        return { exit: true, reason: 'trailing_stop_2atr' };
      }
      pos.stopLoss = Math.min(pos.stopLoss, trailStop);
    }
    return { exit: false, reason: '' };
  },

  calculateSize(capital, riskPct, atr, price) {
    const riskAmount = capital * (riskPct / 100);
    const stopDist = atr * 2;
    return stopDist > 0 ? Math.min(riskAmount / stopDist, capital * 0.25 / price) : 0;
  },
};

// ═══════════════════════════════════════════════════════════════
// 5. PATTERN INTELLIGENCE
// Bullish pattern with confidence > 70% + volume confirm → BUY. Exit on bearish.
// ═══════════════════════════════════════════════════════════════

const patternIntelligence: Strategy = {
  shouldEnter(candles, ind, i) {
    const patterns = detectPatterns(candles.slice(0, i + 1));
    const { signal, strength } = patternScore(patterns, i);
    const volSpike = ind.volume.spike[i];

    if (signal === 'BUY' && strength > 0.7 && volSpike) {
      return { enter: true, side: 'LONG', confidence: strength };
    }
    if (signal === 'SELL' && strength > 0.7 && volSpike) {
      return { enter: true, side: 'SHORT', confidence: strength };
    }

    // Also enter without volume spike if pattern is very strong
    if (signal === 'BUY' && strength > 0.8) {
      return { enter: true, side: 'LONG', confidence: strength * 0.85 };
    }
    if (signal === 'SELL' && strength > 0.8) {
      return { enter: true, side: 'SHORT', confidence: strength * 0.85 };
    }

    return { enter: false, side: 'LONG', confidence: 0 };
  },

  shouldExit(pos, candles, _ind, i) {
    const patterns = detectPatterns(candles.slice(0, i + 1));
    const { signal, strength } = patternScore(patterns, i);

    if (pos.side === 'LONG' && signal === 'SELL' && strength > 0.5) {
      return { exit: true, reason: 'bearish_pattern' };
    }
    if (pos.side === 'SHORT' && signal === 'BUY' && strength > 0.5) {
      return { exit: true, reason: 'bullish_pattern' };
    }
    return { exit: false, reason: '' };
  },

  calculateSize(capital, riskPct, atr, price) {
    const riskAmount = capital * (riskPct / 100);
    const stopDist = atr * 1.5;
    return stopDist > 0 ? Math.min(riskAmount / stopDist, capital * 0.2 / price) : 0;
  },
};

// ═══════════════════════════════════════════════════════════════
// 6. COMBINED AI
// Vote from all strategies — enter when score > 70% (4/6 agree). Kelly sizing.
// ═══════════════════════════════════════════════════════════════

const combinedAI: Strategy = {
  shouldEnter(candles, ind, i) {
    const sub: Strategy[] = [trendFollowing, meanReversion, breakoutStrategy, adaptiveMomentum, patternIntelligence];
    const decisions = sub.map((s) => s.shouldEnter(candles, ind, i));

    let buyVotes = 0;
    let sellVotes = 0;
    let totalConf = 0;

    for (const d of decisions) {
      if (d.enter) {
        if (d.side === 'LONG') buyVotes++;
        else sellVotes++;
        totalConf += d.confidence;
      }
    }

    const total = decisions.length;
    const buyScore = buyVotes / total;
    const sellScore = sellVotes / total;

    // Need 4+ out of 5 sub-strategies to agree (≈70%)
    if (buyScore >= 0.7 && buyVotes >= 4) {
      return { enter: true, side: 'LONG', confidence: Math.min(totalConf / buyVotes, 0.95) };
    }
    if (sellScore >= 0.7 && sellVotes >= 4) {
      return { enter: true, side: 'SHORT', confidence: Math.min(totalConf / sellVotes, 0.95) };
    }

    // Softer threshold: 3+ agree with high average confidence
    if (buyVotes >= 3 && totalConf / buyVotes > 0.75) {
      return { enter: true, side: 'LONG', confidence: totalConf / buyVotes * 0.85 };
    }
    if (sellVotes >= 3 && totalConf / sellVotes > 0.75) {
      return { enter: true, side: 'SHORT', confidence: totalConf / sellVotes * 0.85 };
    }

    return { enter: false, side: 'LONG', confidence: 0 };
  },

  shouldExit(pos, candles, ind, i) {
    // Exit if 3+ sub-strategies signal exit
    const sub: Strategy[] = [trendFollowing, meanReversion, breakoutStrategy, adaptiveMomentum, patternIntelligence];
    let exitVotes = 0;
    let reason = '';
    for (const s of sub) {
      const d = s.shouldExit(pos, candles, ind, i);
      if (d.exit) {
        exitVotes++;
        reason = d.reason;
      }
    }
    if (exitVotes >= 3) return { exit: true, reason: `combined_exit:${reason}` };
    return { exit: false, reason: '' };
  },

  calculateSize(capital, riskPct, atr, price) {
    // Kelly sizing: use fractional Kelly (25%)
    const kellyFraction = 0.25;
    const estimatedWinRate = 0.65;
    const avgWinLossRatio = 2.0;
    const kellyPct = (estimatedWinRate - (1 - estimatedWinRate) / avgWinLossRatio) * kellyFraction;
    const kellySize = capital * Math.max(kellyPct, 0) / price;

    // Also calculate ATR-based size
    const riskAmount = capital * (riskPct / 100);
    const stopDist = atr * 2;
    const atrSize = stopDist > 0 ? riskAmount / stopDist : 0;

    return Math.min(kellySize, atrSize, capital * 0.3 / price);
  },
};

// ═══════════════════════════════════════════════════════════════
// Strategy Map & Signal Generator
// ═══════════════════════════════════════════════════════════════

export const strategyMap: Record<StrategyKey, Strategy> = {
  trend: trendFollowing,
  reversion: meanReversion,
  breakout: breakoutStrategy,
  momentum: adaptiveMomentum,
  pattern: patternIntelligence,
  combined_ai: combinedAI,
};

export function getStrategy(key: StrategyKey): Strategy {
  return strategyMap[key];
}

/** Generate a full signal result for a given bar */
export function generateSignal(
  candles: OHLCV[],
  indicators: Indicators,
  index: number,
  strategyKey: StrategyKey,
): SignalResult {
  const strategy = strategyMap[strategyKey];
  const decision = strategy.shouldEnter(candles, indicators, index);
  const regime = detectRegime(indicators, index);
  const patterns = detectPatterns(candles.slice(0, index + 1)).filter((p) => p.index === index);

  let signal: Signal;
  if (decision.enter) {
    signal = decision.side === 'LONG' ? 'BUY' : 'SELL';
  } else {
    signal = 'NEUTRAL';
  }

  // Map to strength
  const conf = decision.confidence;
  let strength: import('@/types').SignalStrength;
  if (signal === 'BUY') {
    strength = conf > 0.8 ? 'strong_buy' : 'buy';
  } else if (signal === 'SELL') {
    strength = conf > 0.8 ? 'strong_sell' : 'sell';
  } else {
    strength = 'neutral';
  }

  return {
    signal,
    strength,
    confidence: conf,
    strategy: strategyKey,
    indicators: {
      rsi: indicators.rsi[index],
      macdH: indicators.macd.histogram[index],
      adx: indicators.adx[index],
      atr: indicators.atr[index],
      stochK: indicators.stochastic.k[index],
      ema21: indicators.ema21[index],
      bbWidth: indicators.bollinger.width[index],
    },
    patterns,
    regime,
    timestamp: new Date(candles[index].date),
  };
}
