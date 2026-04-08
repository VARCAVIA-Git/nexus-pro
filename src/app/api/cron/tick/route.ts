import { NextResponse } from 'next/server';
import type { OHLCV, StrategyKey, TradeRecord, Side } from '@/types';
import type { MultiBotConfig } from '@/types/bot';
import { computeIndicators } from '@/lib/core/indicators';
import { generateSignal } from '@/lib/analytics/cognition/strategies';
import { checkCircuitBreaker, trailingStopATR, getCapitalRules, timeframePositionSize, preTradeChecks, checkProfitLock } from '@/lib/analytics/action/risk';
import { calculateRiskParams } from '@/lib/config/assets';
import { notifyTrade, notifyTradeClose, notifyBot } from '@/lib/analytics/action/notifications';
import { buildOutcome, saveOutcome } from '@/lib/analytics/learning/outcome-tracker';
import { redisGet, redisSet, redisLpush, KEYS } from '@/lib/db/redis';
import { AlpacaBroker } from '@/lib/broker/alpaca';
import type { BotPosition, BotSignalLog } from '@/lib/analytics/action/live-runner';
import { classifyRegime } from '@/lib/analytics/perception/regime-classifier';
import { evaluateEntryTiming } from '@/lib/analytics/cognition/smart-timing';
import { detectTrap } from '@/lib/analytics/cognition/trap-detector';
import { managePosition } from '@/lib/analytics/action/position-manager';
import { consultBollingerProfile } from '@/lib/research/bollinger-bot';
import { consultDeepMapRules } from '@/lib/research/deep-mapping/bot-integration';

export const dynamic = 'force-dynamic';
export const maxDuration = 55; // Vercel Pro allows up to 60s

// ── Data Fetching — Alpaca primary, CoinGecko/TwelveData fallback ───

import { fetchAlpacaBars } from '@/lib/data/providers/alpaca-data';

const TD_URL = 'https://api.twelvedata.com';
const CG_URL = 'https://api.coingecko.com/api/v3';
const COIN_MAP: Record<string, string> = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot' };

function isCrypto(s: string) { return s.includes('/'); }

async function fetchCandles(symbol: string): Promise<{ candles: OHLCV[]; volumeReliable: boolean }> {
  // Try Alpaca Data API first (has real volume for everything)
  const alpaca = await fetchAlpacaBars(symbol, '1d', 200);
  if (alpaca.length >= 20) {
    return { candles: alpaca, volumeReliable: true };
  }

  // Fallback
  if (isCrypto(symbol)) {
    const id = COIN_MAP[symbol]; if (!id) return { candles: [], volumeReliable: false };
    try {
      const r = await fetch(`${CG_URL}/coins/${id}/ohlc?vs_currency=usd&days=14`);
      if (!r.ok) return { candles: [], volumeReliable: false };
      const d: number[][] = await r.json();
      const candles = d.map(x => ({ date: new Date(x[0]).toISOString().slice(0, 10), open: x[1], high: x[2], low: x[3], close: x[4], volume: 0 }));
      return { candles, volumeReliable: false };
    } catch { return { candles: [], volumeReliable: false }; }
  }

  const k = process.env.TWELVE_DATA_API_KEY; if (!k) return { candles: [], volumeReliable: false };
  try {
    const r = await fetch(`${TD_URL}/time_series?symbol=${symbol}&interval=1day&outputsize=200&apikey=${k}`);
    if (!r.ok) return { candles: [], volumeReliable: false };
    const d = await r.json(); if (d.status === 'error' || !d.values) return { candles: [], volumeReliable: false };
    const candles = d.values.reverse().map((v: any) => ({ date: v.datetime.slice(0, 10), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: parseInt(v.volume) || 0 }));
    return { candles, volumeReliable: true };
  } catch { return { candles: [], volumeReliable: false }; }
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

// PM2 cron-worker.js POSTs to this endpoint, while Vercel Cron sends GET.
// Both verbs map to the same handler.
export async function POST(request: Request) {
  return GET(request);
}

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

  // Broker credentials per mode
  const paperKey = process.env.ALPACA_API_KEY ?? '';
  const paperSecret = process.env.ALPACA_API_SECRET ?? '';
  const liveKey = process.env.ALPACA_LIVE_API_KEY ?? '';
  const liveSecret = process.env.ALPACA_LIVE_SECRET_KEY ?? '';

  function getBrokerForBot(botEnv: string): { broker: AlpacaBroker; ok: boolean; error?: string } {
    if (botEnv === 'real') {
      if (!liveKey || !liveSecret) {
        return { broker: null as any, ok: false, error: 'Live API keys not configured' };
      }
      return { broker: new AlpacaBroker(liveKey, liveSecret, false), ok: true };
    }
    if (!paperKey || !paperSecret) {
      return { broker: null as any, ok: false, error: 'Paper API keys not configured' };
    }
    return { broker: new AlpacaBroker(paperKey, paperSecret, true), ok: true };
  }

  // Get equity from paper account for initial display (most bots are demo)
  let equity = 0, cash = 0;
  if (paperKey && paperSecret) {
    try {
      const paperBroker = new AlpacaBroker(paperKey, paperSecret, true);
      await paperBroker.connect();
      const bal = await paperBroker.getBalance();
      equity = bal.total; cash = bal.available;
    } catch {}
  }

  const results: Array<{ botId: string; name: string; ticked: boolean; signals: number; error?: string }> = [];

  for (const config of runningBots) {
    if (Date.now() - startTime > 45000) break;

    try {
      // Get broker for this bot's mode
      const botMode = config.environment ?? 'demo';
      const { broker, ok: brokerOk, error: brokerErr } = getBrokerForBot(botMode);
      console.log(`[CRON][${config.name}] Mode: ${botMode}, using ${botMode === 'real' ? 'LIVE' : 'PAPER'} Alpaca`);

      if (!brokerOk) {
        console.log(`[CRON][${config.name}] ⚠️ Broker error: ${brokerErr} — skipping`);
        results.push({ botId: config.id, name: config.name, ticked: false, signals: 0, error: brokerErr });
        continue;
      }

      // Get this bot's account equity
      let botEquity = equity, botCash = cash;
      try {
        await broker.connect();
        const bal = await broker.getBalance();
        botEquity = bal.total; botCash = bal.available;
      } catch (err: any) {
        console.log(`[CRON][${config.name}] Broker connect failed: ${err.message}`);
        results.push({ botId: config.id, name: config.name, ticked: false, signals: 0, error: err.message });
        continue;
      }

      const state = await redisGet<PersistedBotState>(BOT_STATE_KEY(config.id)) ?? {
        positions: [], closedTrades: [], signalLog: [], tickCount: 0,
        initialEquity: botEquity, rejectedTrades: 0, profitLocks: 0, lastTick: '',
      };

      const now = new Date();
      state.tickCount++;
      state.lastTick = now.toISOString();
      if (!state.initialEquity) state.initialEquity = botEquity;

      const riskParams = calculateRiskParams(config.riskLevel);
      const tradingCapital = botEquity * (config.capitalPercent / 100);
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
          console.log(`[TICK][${config.name}] Fetching ${symbol}...`);
          const { candles, volumeReliable } = await fetchCandles(symbol);
          console.log(`[TICK][${config.name}] ${symbol}: ${candles.length} candles, vol=${volumeReliable ? 'REAL' : 'NO'}, price=$${candles[candles.length-1]?.close?.toFixed(2) ?? '?'}`);
          if (candles.length < 20) { console.log(`[TICK][${config.name}] ${symbol}: SKIP — insufficient data (${candles.length})`); continue; }
          // Only inject synthetic volume if no volume at all AND not reliable
          if (!volumeReliable && candles.every(c => c.volume === 0)) {
            candles.forEach((c, i) => { c.volume = Math.round(1e6 * (0.8 + Math.sin(i / 10) * 0.3)); });
          }

          const indicators = computeIndicators(candles);
          const lastIdx = candles.length - 1;
          const price = candles[lastIdx].close;

          // Classify regime
          const regime = classifyRegime(candles);
          console.log(`[TICK][${config.name}] ${symbol}: regime=${regime.regime} (${regime.confidence}%) size=${regime.sizeMultiplier}x`);

          // Skip entry on EXHAUSTION
          if (regime.regime === 'EXHAUSTION' && !state.positions.find(p => p.symbol === symbol)) {
            console.log(`[TICK][${config.name}] ${symbol}: EXHAUSTION — skipping entry`);
            continue;
          }

          // Filter strategies by regime
          const allowedStrats = (config.strategies as string[]).filter(s => !regime.avoidStrategies.includes(s));
          const activeStrats = allowedStrats.length > 0 ? allowedStrats : config.strategies;

          let bestSignal: ReturnType<typeof generateSignal> | null = null;
          let bestConf = -1;
          for (const stratKey of activeStrats as StrategyKey[]) {
            const sig = generateSignal(candles, indicators, lastIdx, stratKey);
            if (sig.confidence > bestConf) { bestConf = sig.confidence; bestSignal = sig; }
          }
          if (!bestSignal) continue;
          signalCount++;

          const logEntry: BotSignalLog = { botId: config.id, symbol, signal: bestSignal.signal, confidence: bestSignal.confidence, strategy: bestSignal.strategy, price, regime: bestSignal.regime, time: now.toISOString(), acted: false };

          // Position monitoring with regime-aware management
          const existingPos = state.positions.find(p => p.symbol === symbol);
          if (existingPos) {
            const atr = indicators.atr[lastIdx] || price * 0.02;

            // Dynamic position manager
            const posAction = managePosition({
              entryPrice: existingPos.entryPrice, currentPrice: price,
              side: existingPos.side, stopLoss: existingPos.stopLoss,
              candlesSinceEntry: state.tickCount - (existingPos as any).entryTick || 0,
            }, candles, regime.regime);

            if (posAction.action === 'CLOSE_ALL') {
              console.log(`[TICK][${config.name}] Position ${symbol}: ${posAction.reason}`);
              // Force exit via stop trigger
              existingPos.stopLoss = price; // triggers exit below
            } else if (posAction.action === 'MOVE_STOP' && posAction.newStopPrice) {
              existingPos.stopLoss = posAction.newStopPrice;
              console.log(`[TICK][${config.name}] Position ${symbol}: ${posAction.reason}`);
            }

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
                await notifyTradeClose(existingPos.side, symbol, price, pnl, exitReason, { botName: config.name, pnlPct: existingPos.entryPrice > 0 ? (pnl / (existingPos.quantity * existingPos.entryPrice)) * 100 : 0 });
                logEntry.acted = true;
              } catch {}
            }
            state.signalLog.push(logEntry);
            continue;
          }

          // Asset profile check (avoid hours / best hours boost)
          let profileBoost = 0;
          try {
            const profile = await redisGet<any>(`nexus:rnd:profile:${symbol}:1d`);
            if (profile) {
              const currentHour = new Date().getUTCHours();
              if (profile.avoidHours?.includes(currentHour)) {
                console.log(`[TICK][${config.name}] ${symbol}: hour ${currentHour} UTC in avoidHours — skipping`);
                logEntry.reason = `profile:avoid_hour_${currentHour}`;
                state.signalLog.push(logEntry); continue;
              }
              if (profile.bestHours?.includes(currentHour)) {
                profileBoost = 5;
                console.log(`[TICK][${config.name}] ${symbol}: hour ${currentHour} UTC is best hour — +5 boost`);
              }
            }
          } catch {}

          // ── Bollinger Bot calibrated profile (per-asset TP/SL + conf boost) ──
          let bollingerOverride: any = null;
          let bollingerBoost = 0;
          try {
            const bb = await consultBollingerProfile(symbol, bestSignal.signal as 'BUY' | 'SELL' | 'NEUTRAL', config.name);
            if (bb.hasProfile && bb.confBoost > 0) {
              bollingerBoost = bb.confBoost;
              if (bb.tpDistPct && bb.slDistPct) {
                bollingerOverride = { tpDistPct: bb.tpDistPct, slDistPct: bb.slDistPct };
              }
            }
          } catch {}

          // ── Deep Map rules consultation (pattern-mined edge) ──
          let deepMapBoost = 0;
          try {
            const dmAdj = await consultDeepMapRules(symbol, {
              rsi14: indicators.rsi[lastIdx] ?? 50,
              macdHistogram: indicators.macd.histogram[lastIdx] ?? 0,
              macdSignal: 'ABOVE',
              bbPosition: 'AT_MID',
              bbWidth: indicators.bollinger.width[lastIdx] ?? 0,
              adx14: indicators.adx[lastIdx] ?? 0,
              stochK: indicators.stochastic.k[lastIdx] ?? 50,
              trendShort: 'FLAT',
              trendMedium: 'FLAT',
              trendLong: 'FLAT',
              volumeProfile: 'NORMAL',
              regime: regime.regime,
            }, config.name);
            deepMapBoost = dmAdj;
          } catch {}

          // Mode-based confidence threshold
          const confThreshold = mode === 'scalp' ? 0.55 : mode === 'intraday' ? 0.60 : 0.65;
          const adjustedConf = bestSignal.confidence + (profileBoost / 100) + (bollingerBoost / 100) + (deepMapBoost / 100);
          console.log(`[CRON] Bot "${config.name}": ${symbol} score=${(adjustedConf*100).toFixed(0)}% (base ${(bestSignal.confidence*100).toFixed(0)}, profile +${profileBoost}, BB +${bollingerBoost}, DM ${deepMapBoost > 0 ? '+' : ''}${deepMapBoost}) signal=${bestSignal.signal} threshold=${(confThreshold*100).toFixed(0)}%`);

          if (bestSignal.signal !== 'NEUTRAL' && adjustedConf >= confThreshold) {
            const side: Side = bestSignal.signal === 'BUY' ? 'LONG' : 'SHORT';
            const atr = indicators.atr[lastIdx] || price * 0.02;

            // Trap detection
            const trap = detectTrap(candles, bestSignal.signal as 'BUY' | 'SELL');
            if (trap.trapped) {
              console.log(`[TICK][${config.name}] ⚠️ TRAP: ${trap.trapType} (${trap.confidence}%) — ${trap.recommendation}`);
              logEntry.reason = `trap:${trap.trapType}`;
              state.signalLog.push(logEntry); continue;
            }

            // Smart timing
            const timing = evaluateEntryTiming(candles, price, bestSignal.signal as 'BUY' | 'SELL', regime.regime);
            if (!timing.shouldEnterNow) {
              console.log(`[TICK][${config.name}] ⏳ TIMING: ${timing.suggestedAction} — ${timing.reason}`);
              logEntry.reason = `timing:${timing.suggestedAction}`;
              state.signalLog.push(logEntry); continue;
            }

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
              const sizing = timeframePositionSize(tradingCapital * regime.sizeMultiplier, mode, atr, price);

              // If Bollinger profile provides calibrated TP/SL, override the ATR-based defaults
              let tpDist = sizing.tpDist;
              let slDist = sizing.stopDist;
              if (bollingerOverride) {
                slDist = price * bollingerOverride.slDistPct;
                tpDist = price * bollingerOverride.tpDistPct;
                console.log(`[TICK][${config.name}] ${symbol}: Bollinger override TP=${(bollingerOverride.tpDistPct*100).toFixed(2)}% SL=${(bollingerOverride.slDistPct*100).toFixed(2)}%`);
              }

              if (sizing.quantity > 0 && sizing.capitalUsed < botCash * 0.95 && state.positions.length < capRules.maxOpenPositions) {
                const orderQty = parseFloat(sizing.quantity.toFixed(isCrypto(symbol) ? 6 : 0));
                try {
                  const order = await broker.placeOrder({ symbol, side, type: 'market', quantity: orderQty });
                  state.positions.push({
                    symbol, side, entryPrice: price, quantity: orderQty, orderId: order.id,
                    strategy: bestSignal.strategy as StrategyKey, confidence: bestSignal.confidence,
                    stopLoss: side === 'LONG' ? price - slDist : price + slDist,
                    takeProfit: side === 'LONG' ? price + tpDist : price - tpDist,
                    entryTime: now.toISOString(),
                  });
                  logEntry.acted = true;
                  await notifyTrade(bestSignal.signal as 'BUY' | 'SELL', symbol, price, bestSignal.confidence, bestSignal.strategy, { botName: config.name, regime: regime.regime, score: Math.round(adjustedConf * 100) });
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

  // Save debug info
  await redisSet('nexus:debug:lastTick', { time: new Date().toISOString(), botsProcessed: results.length, results }, 3600).catch(() => {});

  return NextResponse.json({
    processed: results.length,
    elapsed: Date.now() - startTime,
    results,
    timestamp: new Date().toISOString(),
  });
}
