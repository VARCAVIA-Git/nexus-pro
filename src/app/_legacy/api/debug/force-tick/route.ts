import { NextResponse } from 'next/server';
import type { OHLCV, StrategyKey } from '@/types';
import type { MultiBotConfig } from '@/types/bot';
import { computeIndicators } from '@/lib/core/indicators';
import { generateSignal } from '@/lib/analytics/cognition/strategies';
import { checkCircuitBreaker, preTradeChecks, getCapitalRules, timeframePositionSize } from '@/lib/analytics/action/risk';
import { classifyRegime } from '@/lib/analytics/perception/regime-classifier';
import { evaluateEntryTiming } from '@/lib/analytics/cognition/smart-timing';
import { detectTrap } from '@/lib/analytics/cognition/trap-detector';
import { redisGet, KEYS } from '@/lib/db/redis';
import { fetchAlpacaBars } from '@/lib/data/providers/alpaca-data';

export const dynamic = 'force-dynamic';

const CG_URL = 'https://api.coingecko.com/api/v3';
const COIN_MAP: Record<string, string> = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot' };

async function fetchCandles(symbol: string): Promise<{ candles: OHLCV[]; source: string }> {
  const alpaca = await fetchAlpacaBars(symbol, '1d', 200);
  if (alpaca.length >= 20) return { candles: alpaca, source: 'Alpaca' };
  if (symbol.includes('/')) {
    const id = COIN_MAP[symbol];
    if (id) {
      try {
        const r = await fetch(`${CG_URL}/coins/${id}/ohlc?vs_currency=usd&days=14`);
        if (r.ok) {
          const d: number[][] = await r.json();
          return { candles: d.map(x => ({ date: new Date(x[0]).toISOString().slice(0, 10), open: x[1], high: x[2], low: x[3], close: x[4], volume: 0 })), source: 'CoinGecko' };
        }
      } catch {}
    }
  }
  return { candles: [], source: 'none' };
}

// GET /api/debug/force-tick — dry-run tick for all running bots, returns detailed diagnostics
export async function GET() {
  const startTime = Date.now();
  const configs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];
  const runningBots = configs.filter(c => c.status === 'running');

  if (runningBots.length === 0) {
    return NextResponse.json({ message: 'No running bots', allBots: configs.map(c => ({ id: c.id, name: c.name, status: c.status })) });
  }

  const botResults: any[] = [];

  for (const config of runningBots) {
    const botLog: any = {
      id: config.id, name: config.name, mode: config.operationMode, env: config.environment ?? 'demo',
      assets: config.assets, strategies: config.strategies,
      assetResults: [],
    };

    // Load persisted state
    const state = await redisGet<any>(`nexus:bot:state:${config.id}`) ?? { positions: [], closedTrades: [], tickCount: 0, initialEquity: 10000, rejectedTrades: 0 };
    botLog.tickCount = state.tickCount;
    botLog.openPositions = (state.positions ?? []).length;
    botLog.closedTrades = (state.closedTrades ?? []).length;
    botLog.rejectedTrades = state.rejectedTrades ?? 0;

    // Circuit breaker check
    const cb = checkCircuitBreaker(state.closedTrades ?? [], state.initialEquity ?? 10000, state.initialEquity ?? 10000, new Date());
    botLog.circuitBreaker = cb;

    if (cb.isTripped) {
      botLog.status = 'CIRCUIT_BREAKER';
      botResults.push(botLog);
      continue;
    }

    const mode = config.operationMode ?? 'intraday';
    const confThreshold = mode === 'scalp' ? 0.55 : mode === 'intraday' ? 0.60 : 0.65;
    botLog.confidenceThreshold = `${(confThreshold * 100).toFixed(0)}%`;

    for (const symbol of config.assets) {
      const assetLog: any = { symbol, steps: [] };

      // 1. Fetch candles
      const { candles, source } = await fetchCandles(symbol);
      assetLog.steps.push({ step: 'fetch', candles: candles.length, source, price: candles[candles.length - 1]?.close ?? 0 });
      if (candles.length < 20) { assetLog.steps.push({ step: 'SKIP', reason: `insufficient data (${candles.length})` }); botLog.assetResults.push(assetLog); continue; }

      // Synthetic volume if needed
      if (candles.every(c => c.volume === 0)) candles.forEach((c, i) => { c.volume = Math.round(1e6 * (0.8 + Math.sin(i / 10) * 0.3)); });

      const indicators = computeIndicators(candles);
      const lastIdx = candles.length - 1;
      const price = candles[lastIdx].close;

      // 2. Regime
      const regime = classifyRegime(candles);
      assetLog.steps.push({ step: 'regime', regime: regime.regime, confidence: regime.confidence, sizeMultiplier: regime.sizeMultiplier, avoidStrategies: regime.avoidStrategies });

      if (regime.regime === 'EXHAUSTION' && !state.positions?.find((p: any) => p.symbol === symbol)) {
        assetLog.steps.push({ step: 'SKIP', reason: 'EXHAUSTION regime — no new entry' });
        botLog.assetResults.push(assetLog);
        continue;
      }

      // 3. Strategy signals
      const allowedStrats = (config.strategies as string[]).filter(s => !regime.avoidStrategies.includes(s));
      const activeStrats = allowedStrats.length > 0 ? allowedStrats : config.strategies;
      assetLog.steps.push({ step: 'strategies', allowed: activeStrats });

      let bestSignal: any = null;
      let bestConf = -1;
      const signalDetails: any[] = [];
      for (const stratKey of activeStrats as StrategyKey[]) {
        const sig = generateSignal(candles, indicators, lastIdx, stratKey);
        signalDetails.push({ strategy: stratKey, signal: sig.signal, confidence: `${(sig.confidence * 100).toFixed(1)}%`, regime: sig.regime });
        if (sig.confidence > bestConf) { bestConf = sig.confidence; bestSignal = sig; }
      }
      assetLog.steps.push({ step: 'signals', all: signalDetails, best: bestSignal ? { strategy: bestSignal.strategy, signal: bestSignal.signal, confidence: `${(bestSignal.confidence * 100).toFixed(1)}%` } : null });

      if (!bestSignal || bestSignal.signal === 'NEUTRAL') {
        assetLog.steps.push({ step: 'SKIP', reason: 'No actionable signal (NEUTRAL)' });
        botLog.assetResults.push(assetLog);
        continue;
      }

      // 4. Confidence check
      const profileBoost = 0; // Skip profile lookup in debug
      const adjustedConf = bestSignal.confidence + (profileBoost / 100);
      const passesThreshold = adjustedConf >= confThreshold;
      assetLog.steps.push({ step: 'threshold', adjustedConfidence: `${(adjustedConf * 100).toFixed(1)}%`, threshold: `${(confThreshold * 100).toFixed(0)}%`, passes: passesThreshold });

      if (!passesThreshold) {
        assetLog.steps.push({ step: 'SKIP', reason: `Confidence ${(adjustedConf * 100).toFixed(1)}% < threshold ${(confThreshold * 100).toFixed(0)}%` });
        botLog.assetResults.push(assetLog);
        continue;
      }

      // 5. Trap detection
      const trap = detectTrap(candles, bestSignal.signal as 'BUY' | 'SELL');
      assetLog.steps.push({ step: 'trap', trapped: trap.trapped, type: trap.trapType, confidence: trap.confidence, recommendation: trap.recommendation });
      if (trap.trapped) { assetLog.steps.push({ step: 'SKIP', reason: `TRAP: ${trap.trapType}` }); botLog.assetResults.push(assetLog); continue; }

      // 6. Smart timing
      const timing = evaluateEntryTiming(candles, price, bestSignal.signal as 'BUY' | 'SELL', regime.regime);
      assetLog.steps.push({ step: 'timing', shouldEnter: timing.shouldEnterNow, action: timing.suggestedAction, reason: timing.reason });
      if (!timing.shouldEnterNow) { assetLog.steps.push({ step: 'SKIP', reason: `TIMING: ${timing.suggestedAction} — ${timing.reason}` }); botLog.assetResults.push(assetLog); continue; }

      // 7. Pre-trade checks
      const totalPnl = (state.closedTrades ?? []).reduce((s: number, t: any) => s + (t.netPnl ?? 0), 0);
      const check = preTradeChecks({
        dailyPnlPct: 0, weeklyPnlPct: 0,
        totalPnlPct: (state.initialEquity ?? 10000) > 0 ? (totalPnl / (state.initialEquity ?? 10000)) * 100 : 0,
        signalScore: Math.round(bestSignal.confidence * 100), adaptiveMinScore: 70,
        mtfAlignment: bestSignal.regime, calendarBlocked: false, newsScore: 0,
        direction: bestSignal.signal === 'BUY' ? 'long' : 'short',
        openPositionSymbols: (state.positions ?? []).map((p: any) => p.symbol), asset: symbol,
      });
      assetLog.steps.push({ step: 'preTradeCheck', approved: check.approved, reason: check.reason });

      if (!check.approved) {
        assetLog.steps.push({ step: 'REJECTED', reason: check.reason });
      } else {
        // 8. Sizing
        const atr = indicators.atr[lastIdx] || price * 0.02;
        const capRules = getCapitalRules(mode);
        const sizing = timeframePositionSize(10000 * regime.sizeMultiplier, mode, atr, price);
        assetLog.steps.push({
          step: 'WOULD_TRADE',
          side: bestSignal.signal === 'BUY' ? 'LONG' : 'SHORT',
          quantity: sizing.quantity,
          capitalUsed: sizing.capitalUsed,
          stopDist: sizing.stopDist,
          tpDist: sizing.tpDist,
          maxPositions: capRules.maxOpenPositions,
          currentPositions: (state.positions ?? []).length,
        });
      }

      botLog.assetResults.push(assetLog);
    }

    botResults.push(botLog);
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    elapsed: Date.now() - startTime,
    totalBots: configs.length,
    runningBots: runningBots.length,
    bots: botResults,
  });
}
