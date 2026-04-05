import type { Position, RiskAssessment, TradeRecord } from '@/types';

// ═══════════════════════════════════════════════════════════════
// RISK MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════

// ── Timeframe-Based Capital Allocation Rules ──────────────

export const TIMEFRAME_CAPITAL_RULES = {
  scalp:    { maxCapitalPerTrade: 0.05, maxOpenPositions: 5, stopLossATR: 0.5, takeProfitATR: 1.0 },
  intraday: { maxCapitalPerTrade: 0.03, maxOpenPositions: 4, stopLossATR: 1.0, takeProfitATR: 2.0 },
  daily:    { maxCapitalPerTrade: 0.02, maxOpenPositions: 3, stopLossATR: 1.5, takeProfitATR: 3.0 },
  swing:    { maxCapitalPerTrade: 0.015, maxOpenPositions: 2, stopLossATR: 2.0, takeProfitATR: 4.0 },
} as const;

export type OpModeKey = keyof typeof TIMEFRAME_CAPITAL_RULES;

export function getCapitalRules(mode: string) {
  return TIMEFRAME_CAPITAL_RULES[mode as OpModeKey] ?? TIMEFRAME_CAPITAL_RULES.intraday;
}

/** Position size capped by timeframe rules */
export function timeframePositionSize(
  botCapital: number,
  mode: string,
  atr: number,
  price: number,
): { quantity: number; stopDist: number; tpDist: number; capitalUsed: number } {
  const rules = getCapitalRules(mode);
  const maxCapital = botCapital * rules.maxCapitalPerTrade;
  const stopDist = atr * rules.stopLossATR;
  const tpDist = atr * rules.takeProfitATR;
  if (stopDist <= 0 || price <= 0) return { quantity: 0, stopDist: 0, tpDist: 0, capitalUsed: 0 };
  const quantity = maxCapital / price;
  return { quantity, stopDist, tpDist, capitalUsed: maxCapital };
}

// ── Pre-Trade Safety Checks ───────────────────────────────

export interface PreTradeResult {
  approved: boolean;
  reason?: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

export function preTradeChecks(params: {
  dailyPnlPct: number;
  weeklyPnlPct: number;
  totalPnlPct: number;
  signalScore: number;
  adaptiveMinScore: number;
  mtfAlignment: string;
  calendarBlocked: boolean;
  newsScore: number;
  direction: string;
  openPositionSymbols: string[];
  asset: string;
}): PreTradeResult {
  const checks: PreTradeResult['checks'] = [];
  let blocked = false;
  let reason = '';

  // CHECK 1: Daily loss limit
  const c1 = params.dailyPnlPct >= -2;
  checks.push({ name: 'daily_loss', passed: c1, detail: c1 ? undefined : `Daily P&L ${params.dailyPnlPct.toFixed(1)}% < -2%` });
  if (!c1) { blocked = true; reason = 'Daily loss limit reached'; }

  // CHECK 2: Signal score above adaptive minimum
  const c2 = params.signalScore >= params.adaptiveMinScore;
  checks.push({ name: 'min_score', passed: c2, detail: c2 ? undefined : `Score ${params.signalScore} < min ${params.adaptiveMinScore}` });
  if (!c2 && !blocked) { blocked = true; reason = 'Score below adaptive threshold'; }

  // CHECK 3: No timeframe conflict
  const c3 = params.mtfAlignment !== 'conflicting';
  checks.push({ name: 'tf_alignment', passed: c3, detail: c3 ? undefined : 'Timeframe conflict' });
  if (!c3 && !blocked) { blocked = true; reason = 'Timeframe conflict'; }

  // CHECK 4: No high-impact event
  const c4 = !params.calendarBlocked;
  checks.push({ name: 'calendar', passed: c4, detail: c4 ? undefined : 'High impact event approaching' });
  if (!c4 && !blocked) { blocked = true; reason = 'High impact event approaching'; }

  // CHECK 5: News not strongly against direction
  const c5 = !(params.direction === 'long' && params.newsScore < -40) && !(params.direction === 'short' && params.newsScore > 40);
  checks.push({ name: 'news_alignment', passed: c5, detail: c5 ? undefined : 'Strong opposing news sentiment' });
  if (!c5 && !blocked) { blocked = true; reason = 'Strong opposing news sentiment'; }

  // CHECK 6: No correlated position already open
  const c6 = !params.openPositionSymbols.includes(params.asset);
  checks.push({ name: 'no_duplicate', passed: c6, detail: c6 ? undefined : 'Position already open for this asset' });
  if (!c6 && !blocked) { blocked = true; reason = 'Position already open'; }

  // CHECK 7: Weekly drawdown limit
  const c7 = params.weeklyPnlPct >= -4;
  checks.push({ name: 'weekly_dd', passed: c7, detail: c7 ? undefined : `Weekly P&L ${params.weeklyPnlPct.toFixed(1)}% < -4%` });
  if (!c7 && !blocked) { blocked = true; reason = 'Weekly drawdown limit'; }

  // CHECK 8: Capital preservation mode — if profitable, be more selective
  let dynamicMinScore = params.adaptiveMinScore;
  if (params.totalPnlPct > 10) dynamicMinScore = Math.max(dynamicMinScore, 80);
  else if (params.totalPnlPct > 5) dynamicMinScore = Math.max(dynamicMinScore, 75);

  if (dynamicMinScore > params.adaptiveMinScore && params.signalScore < dynamicMinScore) {
    const c8 = false;
    checks.push({ name: 'capital_preservation', passed: c8, detail: `In profit (${params.totalPnlPct.toFixed(1)}%), min score raised to ${dynamicMinScore}` });
    if (!blocked) { blocked = true; reason = `Capital preservation: score ${params.signalScore} < ${dynamicMinScore}`; }
  } else {
    checks.push({ name: 'capital_preservation', passed: true });
  }

  return { approved: !blocked, reason: blocked ? reason : undefined, checks };
}

// ── Profit Lock (Progressive Take Profit) ─────────────────

export interface ProfitLockAction {
  action: 'none' | 'breakeven' | 'lock_1atr' | 'partial_close';
  newStopLoss?: number;
  closeQuantity?: number;
  message?: string;
}

export function checkProfitLock(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  currentPrice: number,
  currentStopLoss: number,
  atr: number,
  quantity: number,
): ProfitLockAction {
  const mult = side === 'LONG' ? 1 : -1;
  const profit = (currentPrice - entryPrice) * mult;
  const atrVal = Math.abs(atr);

  if (atrVal <= 0) return { action: 'none' };

  // At +3x ATR: close 50%, trailing on rest
  if (profit > atrVal * 3) {
    const newSL = side === 'LONG' ? entryPrice + atrVal * 1.5 : entryPrice - atrVal * 1.5;
    return {
      action: 'partial_close',
      newStopLoss: newSL,
      closeQuantity: Math.floor(quantity * 0.5 * 1e6) / 1e6, // half position
      message: `Profit lock: +3 ATR reached, closing 50%, SL → +1.5 ATR`,
    };
  }

  // At +2x ATR: move SL to +1 ATR (locked profit)
  if (profit > atrVal * 2) {
    const newSL = side === 'LONG' ? entryPrice + atrVal : entryPrice - atrVal;
    if ((side === 'LONG' && newSL > currentStopLoss) || (side === 'SHORT' && newSL < currentStopLoss)) {
      return { action: 'lock_1atr', newStopLoss: newSL, message: 'Profit lock: SL moved to +1 ATR' };
    }
  }

  // At +1x ATR: move SL to breakeven
  if (profit > atrVal) {
    if ((side === 'LONG' && entryPrice > currentStopLoss) || (side === 'SHORT' && entryPrice < currentStopLoss)) {
      return { action: 'breakeven', newStopLoss: entryPrice, message: 'Profit lock: SL moved to breakeven' };
    }
  }

  return { action: 'none' };
}

/** Kelly Criterion with fractional Kelly (default 25%) */
export function kellySize(
  winRate: number,
  avgWinLossRatio: number,
  fraction = 0.25,
): number {
  // Kelly % = W - (1-W)/R
  const kelly = winRate - (1 - winRate) / avgWinLossRatio;
  return Math.max(kelly * fraction, 0);
}

/** Position sizing based on ATR-distance to stop loss */
export function atrPositionSize(
  capital: number,
  riskPct: number,
  atr: number,
  atrMultiplier: number,
  price: number,
): number {
  const riskAmount = capital * (riskPct / 100);
  const stopDist = atr * atrMultiplier;
  if (stopDist <= 0 || price <= 0) return 0;
  return riskAmount / stopDist;
}

/** Calculate Pearson correlation between two arrays */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }

  const denom = Math.sqrt((n * sumA2 - sumA ** 2) * (n * sumB2 - sumB ** 2));
  if (denom === 0) return 0;
  return (n * sumAB - sumA * sumB) / denom;
}

/** Check correlation risk among open positions using recent closes */
export function correlationRisk(
  positionCloses: number[][],
  threshold = 0.7,
): { maxCorrelation: number; highCorrelationPairs: [number, number][] } {
  let maxCorr = 0;
  const pairs: [number, number][] = [];

  for (let i = 0; i < positionCloses.length; i++) {
    for (let j = i + 1; j < positionCloses.length; j++) {
      const corr = Math.abs(pearsonCorrelation(positionCloses[i], positionCloses[j]));
      maxCorr = Math.max(maxCorr, corr);
      if (corr > threshold) pairs.push([i, j]);
    }
  }

  return { maxCorrelation: maxCorr, highCorrelationPairs: pairs };
}

// ── Circuit Breaker ───────────────────────────────────────

export interface CircuitBreakerState {
  dailyPnl: number;
  weeklyPnl: number;
  totalPnl: number;
  dailyPnlPct: number;
  weeklyPnlPct: number;
  totalPnlPct: number;
  isTripped: boolean;
  reason?: string;
  /** ISO date when the breaker can be reset */
  resumeAfter?: string;
}

/** Check circuit breaker conditions */
export function checkCircuitBreaker(
  trades: TradeRecord[],
  initialCapital: number,
  currentCapital: number,
  now: Date,
): CircuitBreakerState {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const closedTrades = trades.filter((t) => t.status === 'closed' && t.exitAt);

  const dailyTrades = closedTrades.filter((t) => t.exitAt! >= dayStart);
  const weeklyTrades = closedTrades.filter((t) => t.exitAt! >= weekStart);

  const dailyPnl = dailyTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const weeklyPnl = weeklyTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const totalPnl = currentCapital - initialCapital;

  const dailyPnlPct = initialCapital > 0 ? (dailyPnl / initialCapital) * 100 : 0;
  const weeklyPnlPct = initialCapital > 0 ? (weeklyPnl / initialCapital) * 100 : 0;
  const totalPnlPct = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;

  // -3% daily → stop 24h
  if (dailyPnlPct <= -3) {
    const resume = new Date(now);
    resume.setHours(resume.getHours() + 24);
    return {
      dailyPnl, weeklyPnl, totalPnl,
      dailyPnlPct, weeklyPnlPct, totalPnlPct,
      isTripped: true,
      reason: 'daily_loss_3pct',
      resumeAfter: resume.toISOString(),
    };
  }

  // -5% weekly → stop 72h
  if (weeklyPnlPct <= -5) {
    const resume = new Date(now);
    resume.setHours(resume.getHours() + 72);
    return {
      dailyPnl, weeklyPnl, totalPnl,
      dailyPnlPct, weeklyPnlPct, totalPnlPct,
      isTripped: true,
      reason: 'weekly_loss_5pct',
      resumeAfter: resume.toISOString(),
    };
  }

  // -15% total → full stop
  if (totalPnlPct <= -15) {
    return {
      dailyPnl, weeklyPnl, totalPnl,
      dailyPnlPct, weeklyPnlPct, totalPnlPct,
      isTripped: true,
      reason: 'total_loss_15pct',
    };
  }

  return {
    dailyPnl, weeklyPnl, totalPnl,
    dailyPnlPct, weeklyPnlPct, totalPnlPct,
    isTripped: false,
  };
}

/** Calculate trailing stop based on ATR */
export function trailingStopATR(
  side: 'LONG' | 'SHORT',
  currentPrice: number,
  currentStop: number,
  atr: number,
  multiplier = 2,
): number {
  if (side === 'LONG') {
    const newStop = currentPrice - atr * multiplier;
    return Math.max(currentStop, newStop);
  } else {
    const newStop = currentPrice + atr * multiplier;
    return Math.min(currentStop, newStop);
  }
}

/** Full risk assessment for a potential new position */
export function assessRisk(
  capital: number,
  riskPct: number,
  atr: number,
  price: number,
  winRate: number,
  avgWinLossRatio: number,
  openPositions: Position[],
  positionCloses: number[][],
): RiskAssessment {
  const kellyPct = kellySize(winRate, avgWinLossRatio);
  const kellyDollar = capital * kellyPct;
  const atrSize = atrPositionSize(capital, riskPct, atr, 2, price);
  const posSize = Math.min(atrSize, kellyDollar / price);

  const { maxCorrelation } = positionCloses.length > 0
    ? correlationRisk(positionCloses)
    : { maxCorrelation: 0 };

  const stopDist = atr * 2;
  const stopLossPrice = price - stopDist;

  return {
    positionSize: posSize,
    kellySize: kellyDollar / price,
    maxRiskAmount: capital * (riskPct / 100),
    stopLossPrice,
    correlationRisk: maxCorrelation,
    circuitBreakerActive: false,
  };
}
