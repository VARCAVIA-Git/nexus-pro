import { NextResponse } from 'next/server';
import type { OHLCV, StrategyKey, TradeRecord, Side } from '@/types';
import type { MultiBotConfig } from '@/types/bot';
import { computeIndicators } from '@/lib/engine/indicators';
import { generateSignal } from '@/lib/engine/strategies';
import { checkCircuitBreaker, trailingStopATR, getCapitalRules, timeframePositionSize, preTradeChecks, checkProfitLock } from '@/lib/engine/risk';
import { calculateRiskParams } from '@/lib/config/assets';
import { notifyTrade, notifyTradeClose, notifyBot } from '@/lib/engine/notifications';
import { buildOutcome, saveOutcome } from '@/lib/engine/learning/outcome-tracker';
import { redisGet, redisSet, redisLpush, KEYS } from '@/lib/db/redis';
import { AlpacaBroker } from '@/lib/broker/alpaca';
import type { BotPosition, BotSignalLog } from '@/lib/engine/live-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 55; // Vercel Pro allows up to 60s

// ── Data Fetching ─────────────────────────────────────────

const TD_URL = 'https://api.twelvedata.com';
const CG_URL = 'https://api.coingecko.com/api/v3';
const COIN_MAP: Record<string, string> = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot' };

function isCrypto(s: string) { return s.includes('/'); }

async function fetchCandles(symbol: string): Promise<OHLCV[]> {
  if (isCrypto(symbol)) {
    const id = COIN_MAP[symbol]; if (!id) return [];
    try { const r = await fetch(`${CG_URL}/coins/${id}/ohlc?vs_currency=usd&days=250`); if (!r.ok) return []; const d: number[][] = await r.json(); return d.map(x => ({ date: new Date(x[0]).toISOString().slice(0, 10), open: x[1], high: x[2], low: x[3], close: x[4], volume: Math.round(1e6 * (0.5 + Math.random() * 0.8)) })); } catch { return []; }
  }
  const k = process.env.TWELVE_DATA_API_KEY; if (!k) return [];
  try { const r = await fetch(`${TD_URL}/time_series?symbol=${symbol}&interval=1day&outputsize=250&apikey=${k}`); if (!r.ok) return []; const d = await r.json(); if (d.status === 'error' || !d.values) return []; return d.values.reverse().map((v: any) => ({ date: v.datetime.slice(0, 10), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: parseInt(v.volume) || 0 })); } catch { return []; }
}

// ── Redis State Keys ──────────────────────────────────────

const BOT_STATE_KEY = (id: string) => `nexus:bot:state:${id}`;

interface PersistedBotState {
  positions: BotPosition[];
  closedTrades: TradeRecord[];
  signalLog: BotSignalLog[];
  tickCount: number;
  initialEquity: number;
  rejectedTrades: number;
  profitLocks: number;
  lastTick: string;
}

// ── Cron Tick Handler ─────────────────────────────────────

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log(`[CRON TICK] ${new Date().toISOString()}`);

  // Load all bot configs from Redis
  const configs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];
  const runningBots = configs.filter(c => c.status === 'running');
  console.log(`[CRON] ${configs.length} total bots, ${runningBots.length} running`);

  if (runningBots.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No running bots' });
  }

  // Create broker
  const apiKey = process.env.ALPACA_API_KEY ?? '';
  const apiSecret = process.env.ALPACA_API_SECRET ?? '';
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Alpaca not configured' }, { status: 500 });
  }
  const broker = new AlpacaBroker(apiKey, apiSecret, true);
  let equity = 0, cash = 0;
  try {
    await broker.connect();
    const bal = await broker.getBalance();
    equity = bal.total;
    cash = bal.available;
  } catch (err: any) {
    return NextResponse.json({ error: `Broker: ${err.message}` }, { status: 500 });
  }

  const results: Array<{ botId: string; name: string; ticked: boolean; signals: number; error?: string }> = [];

  for (const config of runningBots) {
    // Time guard: don't start a new bot tick if close to timeout
    if (Date.now() - startTime > 45000) break;

    try {
      // Load persisted state
      const state = await redisGet<PersistedBotState>(BOT_STATE_KEY(config.id)) ?? {
        positions: [], closedTrades: [], signalLog: [], tickCount: 0,
        initialEquity: equity, rejectedTrades: 0, profitLocks: 0, lastTick: '',
      };

      const now = new Date();
      state.tickCount++;
      state.lastTick = now.toISOString();
      if (!state.initialEquity) state.initialEquity = equity;

      const riskParams = calculateRiskParams(config.riskLevel);
      const tradingCapital = equity * (config.capitalPercent / 100);
      const mode = config.operationMode ?? 'intraday';
      const capRules = getCapitalRules(mode);
      let signalCount = 0;

      // Circuit breaker
      const cb = checkCircuitBreaker(state.closedTrades, state.initialEquity, equity, now);
      if (cb.isTripped) {
        config.status = 'paused';
        await notifyBot('circuit_breaker', `Bot "${config.name}": ${cb.reason}`);
        await redisSet(BOT_STATE_KEY(config.id), state);
        // Update config status in Redis
        const allConfigs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];
        const idx = allConfigs.findIndex(c => c.id === config.id);
        if (idx >= 0) { allConfigs[idx].status = 'paused'; await redisSet(KEYS.botConfig, allConfigs); }
        results.push({ botId: config.id, name: config.name, ticked: false, signals: 0, error: `Circuit breaker: ${cb.reason}` });
        continue;
      }

      for (const symbol of config.assets) {
        if (Date.now() - startTime > 50000) break; // Time guard

        try {
          const candles = await fetchCandles(symbol);
          if (candles.length < 60) continue;
          if (candles.every(c => c.volume === 0)) candles.forEach((c, i) => { c.volume = Math.round(1e6 * (0.5 + Math.sin(i / 10) * 0.3 + Math.random() * 0.4)); });

          const indicators = computeIndicators(candles);
          const lastIdx = candles.length - 1;
          const price = candles[lastIdx].close;

          let bestSignal: ReturnType<typeof generateSignal> | null = null;
          let bestConf = -1;
          for (const stratKey of config.strategies as StrategyKey[]) {
            const sig = generateSignal(candles, indicators, lastIdx, stratKey);
            if (sig.confidence > bestConf) { bestConf = sig.confidence; bestSignal = sig; }
          }
          if (!bestSignal) continue;
          signalCount++;

          const logEntry: BotSignalLog = { botId: config.id, symbol, signal: bestSignal.signal, confidence: bestSignal.confidence, strategy: bestSignal.strategy, price, regime: bestSignal.regime, time: now.toISOString(), acted: false };

          // Position monitoring with profit lock
          const existingPos = state.positions.find(p => p.symbol === symbol);
          if (existingPos) {
            const atr = indicators.atr[lastIdx] || price * 0.02;
            existingPos.stopLoss = trailingStopATR(existingPos.side, price, existingPos.stopLoss, atr, config.useTrailingStop ? capRules.stopLossATR : 999);

            const lock = checkProfitLock(existingPos.side, existingPos.entryPrice, price, existingPos.stopLoss, atr, existingPos.quantity);
            if (lock.action === 'partial_close' && lock.closeQuantity) {
              try {
                await broker.placeOrder({ symbol, side: existingPos.side === 'LONG' ? 'SHORT' : 'LONG', type: 'market', quantity: lock.closeQuantity });
                existingPos.quantity -= lock.closeQuantity;
                existingPos.stopLoss = lock.newStopLoss ?? existingPos.stopLoss;
                state.profitLocks++;
              } catch {}
            } else if (lock.action !== 'none' && lock.newStopLoss) {
              existingPos.stopLoss = lock.newStopLoss;
              if (lock.action === 'breakeven') state.profitLocks++;
            }

            let shouldExit = false, exitReason = '';
            if (existingPos.side === 'LONG') {
              if (price <= existingPos.stopLoss) { shouldExit = true; exitReason = 'stop_loss'; }
              else if (price >= existingPos.takeProfit) { shouldExit = true; exitReason = 'take_profit'; }
            } else {
              if (price >= existingPos.stopLoss) { shouldExit = true; exitReason = 'stop_loss'; }
              else if (price <= existingPos.takeProfit) { shouldExit = true; exitReason = 'take_profit'; }
            }

            if (shouldExit) {
              try {
                await broker.placeOrder({ symbol, side: existingPos.side === 'LONG' ? 'SHORT' : 'LONG', type: 'market', quantity: existingPos.quantity });
                const mult = existingPos.side === 'LONG' ? 1 : -1;
                const pnl = (price - existingPos.entryPrice) * existingPos.quantity * mult;
                const trade: TradeRecord = {
                  id: existingPos.orderId, symbol, side: existingPos.side, status: 'closed',
                  entryPrice: existingPos.entryPrice, exitPrice: price,
                  stopLoss: existingPos.stopLoss, takeProfit: existingPos.takeProfit,
                  quantity: existingPos.quantity, sizeUsd: existingPos.quantity * existingPos.entryPrice,
                  grossPnl: pnl, commission: 0, netPnl: pnl,
                  pnlPct: existingPos.entryPrice > 0 ? (pnl / (existingPos.quantity * existingPos.entryPrice)) * 100 : 0,
                  entryAt: new Date(existingPos.entryTime), exitAt: now,
                  strategy: existingPos.strategy, confidence: existingPos.confidence,
                  regime: 'NORMAL', exitReason, isLive: true,
                };
                state.closedTrades.push(trade);
                state.positions = state.positions.filter(p => p.symbol !== symbol);
                redisLpush(KEYS.trades, trade, 500).catch(() => {});
                saveOutcome(buildOutcome({ tradeId: trade.id, asset: symbol, side: existingPos.side, entryPrice: existingPos.entryPrice, exitPrice: price, pnl, entryTime: existingPos.entryTime, exitTime: now, strategy: existingPos.strategy, confidence: existingPos.confidence, regime: 'NORMAL' })).catch(() => {});
                await notifyTradeClose(existingPos.side, symbol, price, pnl, exitReason);
                logEntry.acted = true;
              } catch {}
            }
            state.signalLog.push(logEntry);
            continue;
          }

          // Entry with pre-trade checks
          // Mode-based confidence threshold
          const confThreshold = mode === 'scalp' ? 0.55 : mode === 'intraday' ? 0.60 : 0.65;
          console.log(`[CRON] Bot "${config.name}": ${symbol} score=${(bestSignal.confidence*100).toFixed(0)}% signal=${bestSignal.signal} threshold=${(confThreshold*100).toFixed(0)}%`);

          if (bestSignal.signal !== 'NEUTRAL' && bestSignal.confidence >= confThreshold) {
            const side: Side = bestSignal.signal === 'BUY' ? 'LONG' : 'SHORT';
            const atr = indicators.atr[lastIdx] || price * 0.02;
            const totalPnl = state.closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);

            const check = preTradeChecks({
              dailyPnlPct: 0, weeklyPnlPct: 0, totalPnlPct: state.initialEquity > 0 ? (totalPnl / state.initialEquity) * 100 : 0,
              signalScore: Math.round(bestSignal.confidence * 100), adaptiveMinScore: 70,
              mtfAlignment: bestSignal.regime, calendarBlocked: false, newsScore: 0,
              direction: side === 'LONG' ? 'long' : 'short',
              openPositionSymbols: state.positions.map(p => p.symbol), asset: symbol,
            });

            if (!check.approved) {
              state.rejectedTrades++;
              logEntry.reason = `rejected: ${check.reason}`;
            } else {
              const sizing = timeframePositionSize(tradingCapital, mode, atr, price);
              if (sizing.quantity > 0 && sizing.capitalUsed < cash * 0.95 && state.positions.length < capRules.maxOpenPositions) {
                const orderQty = parseFloat(sizing.quantity.toFixed(isCrypto(symbol) ? 6 : 0));
                try {
                  const order = await broker.placeOrder({ symbol, side, type: 'market', quantity: orderQty });
                  state.positions.push({
                    symbol, side, entryPrice: price, quantity: orderQty, orderId: order.id,
                    strategy: bestSignal.strategy as StrategyKey, confidence: bestSignal.confidence,
                    stopLoss: side === 'LONG' ? price - sizing.stopDist : price + sizing.stopDist,
                    takeProfit: side === 'LONG' ? price + sizing.tpDist : price - sizing.tpDist,
                    entryTime: now.toISOString(),
                  });
                  logEntry.acted = true;
                  await notifyTrade(bestSignal.signal as 'BUY' | 'SELL', symbol, price, bestSignal.confidence, bestSignal.strategy);
                } catch {}
              }
            }
          }

          state.signalLog.push(logEntry);
          if (state.signalLog.length > 100) state.signalLog = state.signalLog.slice(-50);
        } catch {}
      }

      // Update stats
      const closed = state.closedTrades;
      const wins = closed.filter(t => (t.netPnl ?? 0) > 0);
      const totalPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
      config.stats = {
        totalTrades: closed.length,
        winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
        pnl: totalPnl,
        pnlPercent: state.initialEquity > 0 ? (totalPnl / state.initialEquity) * 100 : 0,
        sharpe: 0, maxDrawdown: 0,
      };
      config.lastTickAt = state.lastTick;

      // Persist state and config
      await redisSet(BOT_STATE_KEY(config.id), state);
      const allConfigs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];
      const idx = allConfigs.findIndex(c => c.id === config.id);
      if (idx >= 0) { allConfigs[idx] = config; await redisSet(KEYS.botConfig, allConfigs); }

      results.push({ botId: config.id, name: config.name, ticked: true, signals: signalCount });
    } catch (err: any) {
      results.push({ botId: config.id, name: config.name, ticked: false, signals: 0, error: err.message });
    }
  }

  return NextResponse.json({
    processed: results.length,
    elapsed: Date.now() - startTime,
    results,
    timestamp: new Date().toISOString(),
  });
}
