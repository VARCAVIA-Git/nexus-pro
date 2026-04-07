// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Multi-Bot Live Trading Runner
// Each bot runs independently with its own config, positions, and P&L.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, StrategyKey, TradeRecord, Side, Regime } from '@/types';
import type { MultiBotConfig, MultiBotCreateInput } from '@/types/bot';
import { computeIndicators } from './indicators';
import { generateSignal, getStrategy } from './strategies';
import { consultDeepMapRules } from './deep-mapping/bot-integration';
import { consultBollingerProfile } from './bollinger-bot/bot-integration';
import { checkCircuitBreaker, trailingStopATR, atrPositionSize, getCapitalRules, timeframePositionSize, preTradeChecks, checkProfitLock } from './risk';
import { AlpacaBroker } from '@/lib/broker/alpaca';
import { notifyTrade, notifyTradeClose, notifyBot } from './notifications';
import { redisLpush, redisSet, redisGet, KEYS } from '@/lib/db/redis';
import { saveOutcome, buildOutcome } from './learning/outcome-tracker';
import { nanoid } from 'nanoid';
import { calculateRiskParams } from '@/lib/config/assets';

// ── Re-export old types for backward compat ──────────────
export type BotConfig = MultiBotConfig;

export interface BotPosition {
  symbol: string; side: Side; entryPrice: number; quantity: number;
  orderId: string; strategy: StrategyKey; confidence: number;
  stopLoss: number; takeProfit: number; entryTime: string;
}

export interface BotSignalLog {
  botId: string; symbol: string; signal: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number; strategy: string; price: number;
  regime: string; time: string; acted: boolean; reason?: string;
}

export interface BotStatus {
  running: boolean; startedAt: string | null; config: MultiBotConfig | null;
  positions: BotPosition[]; closedTrades: TradeRecord[];
  signalLog: BotSignalLog[]; lastTick: string | null; tickCount: number;
  circuitBreaker: { active: boolean; reason?: string; resumeAfter?: string };
  accountEquity: number; accountCash: number; totalPnl: number; error: string | null;
  rejectedTrades: number; profitLocks: number;
  preTradeLog: Array<{ time: string; asset: string; approved: boolean; reason?: string }>;
}

// ── Per-bot runtime state ─────────────────────────────────

interface BotRuntime {
  config: MultiBotConfig;
  timer: ReturnType<typeof setInterval> | null;
  positions: BotPosition[];
  closedTrades: TradeRecord[];
  signalLog: BotSignalLog[];
  lastTick: string | null;
  tickCount: number;
  circuitBreaker: { active: boolean; reason?: string; resumeAfter?: string };
  initialEquity: number;
  error: string | null;
  rejectedTrades: number;
  profitLocks: number;
  preTradeLog: Array<{ time: string; asset: string; approved: boolean; reason?: string }>;
}

// ── Global state (survives HMR) ──────────────────────────

const G = globalThis as any;
if (!G.__nexusBots) G.__nexusBots = {} as Record<string, BotRuntime>;
if (!G.__nexusBroker) G.__nexusBroker = null as AlpacaBroker | null;
if (!G.__nexusEquity) G.__nexusEquity = { equity: 0, cash: 0 };
const bots: Record<string, BotRuntime> = G.__nexusBots;

// ── Shared broker ─────────────────────────────────────────

async function ensureBroker(): Promise<AlpacaBroker> {
  if (G.__nexusBroker) return G.__nexusBroker;
  const key = process.env.ALPACA_API_KEY ?? '';
  const secret = process.env.ALPACA_API_SECRET ?? '';
  if (!key || !secret) throw new Error('Alpaca API keys not configured');
  const broker = new AlpacaBroker(key, secret, true);
  await broker.connect();
  G.__nexusBroker = broker;
  return broker;
}

async function refreshBalance(): Promise<{ equity: number; cash: number }> {
  try {
    const broker = await ensureBroker();
    const bal = await broker.getBalance();
    G.__nexusEquity = { equity: bal.total, cash: bal.available };
  } catch {}
  return G.__nexusEquity;
}

// ── Data Fetching ─────────────────────────────────────────

const TWELVE_DATA_URL = 'https://api.twelvedata.com';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';
const COIN_ID_MAP: Record<string, string> = {
  'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana',
  'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot',
};

function isCrypto(symbol: string): boolean { return symbol.includes('/'); }

async function fetchCandles(symbol: string): Promise<OHLCV[]> {
  if (isCrypto(symbol)) {
    const id = COIN_ID_MAP[symbol]; if (!id) return [];
    try { const r = await fetch(`${COINGECKO_URL}/coins/${id}/ohlc?vs_currency=usd&days=250`); if (!r.ok) return []; const d: number[][] = await r.json(); return d.map(x => ({ date: new Date(x[0]).toISOString().slice(0,10), open: x[1], high: x[2], low: x[3], close: x[4], volume: Math.round(1e6*(0.5+Math.random()*0.8)) })); } catch { return []; }
  } else {
    const k = process.env.TWELVE_DATA_API_KEY; if (!k) return [];
    try { const r = await fetch(`${TWELVE_DATA_URL}/time_series?symbol=${symbol}&interval=1day&outputsize=250&apikey=${k}`); if (!r.ok) return []; const d = await r.json(); if (d.status === 'error' || !d.values) return []; return d.values.reverse().map((v:any) => ({ date: v.datetime.slice(0,10), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: parseInt(v.volume)||0 })); } catch { return []; }
  }
}

// ── Per-Bot Tick ──────────────────────────────────────────

async function tickBot(botId: string) {
  const rt = bots[botId];
  if (!rt || rt.config.status !== 'running') return;

  const now = new Date();
  rt.lastTick = now.toISOString();
  rt.tickCount++;
  rt.config.lastTickAt = rt.lastTick;

  try {
    const { equity, cash } = await refreshBalance();
    const riskParams = calculateRiskParams(rt.config.riskLevel);
    const tradingCapital = equity * (rt.config.capitalPercent / 100);

    // Circuit breaker
    const cb = checkCircuitBreaker(rt.closedTrades, rt.initialEquity || equity, equity, now);
    if (cb.isTripped) {
      rt.circuitBreaker = { active: true, reason: cb.reason, resumeAfter: cb.resumeAfter };
      rt.config.status = 'paused';
      rt.error = `Circuit breaker: ${cb.reason}`;
      await notifyBot('circuit_breaker', `Bot "${rt.config.name}": ${cb.reason}`);
      persistAllBots();
      return;
    }
    rt.circuitBreaker = { active: false };

    const broker = await ensureBroker();

    for (const symbol of rt.config.assets) {
      try {
        const candles = await fetchCandles(symbol);
        if (candles.length < 60) continue;
        if (candles.every(c => c.volume === 0)) candles.forEach((c, i) => { c.volume = Math.round(1e6*(0.5+Math.sin(i/10)*0.3+Math.random()*0.4)); });

        const indicators = computeIndicators(candles);
        const lastIdx = candles.length - 1;
        const price = candles[lastIdx].close;

        let bestSignal: ReturnType<typeof generateSignal> | null = null;
        let bestConf = -1;
        for (const stratKey of rt.config.strategies as StrategyKey[]) {
          const sig = generateSignal(candles, indicators, lastIdx, stratKey);
          if (sig.confidence > bestConf) { bestConf = sig.confidence; bestSignal = sig; }
        }
        if (!bestSignal) continue;

        // ── Deep Mapping consultation ──
        // Build current context from already-computed indicators (no recompute)
        try {
          const macdH = indicators.macd.histogram[lastIdx] ?? 0;
          const macdHPrev = indicators.macd.histogram[lastIdx - 1] ?? 0;
          const macdSignal = macdH > 0 && macdHPrev <= 0 ? 'CROSS_UP'
            : macdH < 0 && macdHPrev >= 0 ? 'CROSS_DOWN'
            : macdH > 0 ? 'ABOVE' : 'BELOW';
          const lower = indicators.bollinger.lower[lastIdx];
          const mid = indicators.bollinger.mid[lastIdx];
          const upper = indicators.bollinger.upper[lastIdx];
          let bbPosition = 'AT_MID';
          if (lower !== null && mid !== null && upper !== null) {
            if (price < lower * 0.998) bbPosition = 'BELOW_LOWER';
            else if (price < lower * 1.005) bbPosition = 'AT_LOWER';
            else if (price < mid * 0.998) bbPosition = 'LOWER_HALF';
            else if (price < mid * 1.002) bbPosition = 'AT_MID';
            else if (price < upper * 0.995) bbPosition = 'UPPER_HALF';
            else if (price < upper * 1.002) bbPosition = 'AT_UPPER';
            else bbPosition = 'ABOVE_UPPER';
          }
          const slope5 = lastIdx >= 5 && candles[lastIdx - 5].close > 0 ? (price - candles[lastIdx - 5].close) / candles[lastIdx - 5].close : 0;
          const slope20 = lastIdx >= 20 && candles[lastIdx - 20].close > 0 ? (price - candles[lastIdx - 20].close) / candles[lastIdx - 20].close : 0;
          const slope50 = lastIdx >= 50 && candles[lastIdx - 50].close > 0 ? (price - candles[lastIdx - 50].close) / candles[lastIdx - 50].close : 0;
          const trendOf = (s: number) => s > 0.015 ? 'STRONG_UP' : s > 0.003 ? 'UP' : s < -0.015 ? 'STRONG_DOWN' : s < -0.003 ? 'DOWN' : 'FLAT';
          const avgVol = indicators.volume.avg20[lastIdx] ?? 0;
          const volRatio = avgVol > 0 ? candles[lastIdx].volume / avgVol : 1;
          const volumeProfile = volRatio > 2.5 ? 'CLIMAX' : volRatio > 1.5 ? 'HIGH' : volRatio < 0.5 ? 'DRY' : volRatio < 0.8 ? 'LOW' : 'NORMAL';
          const adx = indicators.adx[lastIdx] ?? 0;
          const atrPct = price > 0 ? (indicators.atr[lastIdx] ?? 0) / price : 0;
          const dmRegime = atrPct > 0.025 ? 'VOLATILE' : adx > 25 && slope20 > 0.005 ? 'TRENDING_UP' : adx > 25 && slope20 < -0.005 ? 'TRENDING_DOWN' : 'RANGING';

          const adjustment = await consultDeepMapRules(symbol, {
            rsi14: indicators.rsi[lastIdx] ?? 50,
            macdHistogram: macdH,
            macdSignal,
            bbPosition,
            bbWidth: indicators.bollinger.width[lastIdx] ?? 0,
            adx14: adx,
            stochK: indicators.stochastic.k[lastIdx] ?? 50,
            trendShort: trendOf(slope5),
            trendMedium: trendOf(slope20),
            trendLong: trendOf(slope50),
            volumeProfile,
            regime: dmRegime,
          }, rt.config.name);

          if (adjustment !== 0) {
            // Apply adjustment to confidence (scaled to 0-1 range)
            const newConf = Math.max(0, Math.min(1, bestSignal.confidence + adjustment / 100));
            console.log(`[TICK][${rt.config.name}] Deep Map adjustment: ${adjustment > 0 ? '+' : ''}${adjustment} → confidence ${(bestSignal.confidence * 100).toFixed(0)}% → ${(newConf * 100).toFixed(0)}%`);
            bestSignal = { ...bestSignal, confidence: newConf };
          }
        } catch (e: any) {
          // Deep map is optional — never block trading on failures
          console.warn(`[TICK][${rt.config.name}] Deep Map consult failed: ${e.message}`);
        }

        // ── Bollinger Bot calibrated profile (per-asset edge) ──
        let bollingerOverride: { tpDistPct: number; slDistPct: number } | null = null;
        try {
          const bb = await consultBollingerProfile(symbol, bestSignal.signal as 'BUY' | 'SELL' | 'NEUTRAL', rt.config.name);
          if (bb.hasProfile && bb.confBoost > 0) {
            const newConf = Math.min(1, bestSignal.confidence + bb.confBoost / 100);
            bestSignal = { ...bestSignal, confidence: newConf };
            if (bb.tpDistPct && bb.slDistPct) {
              bollingerOverride = { tpDistPct: bb.tpDistPct, slDistPct: bb.slDistPct };
            }
          }
        } catch (e: any) {
          console.warn(`[TICK][${rt.config.name}] Bollinger consult failed: ${e.message}`);
        }

        const logEntry: BotSignalLog = { botId, symbol, signal: bestSignal.signal, confidence: bestSignal.confidence, strategy: bestSignal.strategy, price, regime: bestSignal.regime, time: now.toISOString(), acted: false };

        // Check existing position — with PROFIT LOCK
        const existingPos = rt.positions.find(p => p.symbol === symbol);
        const mode = rt.config.operationMode ?? 'intraday';
        const capRules = getCapitalRules(mode);

        if (existingPos) {
          const atr = indicators.atr[lastIdx] || price * 0.02;
          existingPos.stopLoss = trailingStopATR(existingPos.side, price, existingPos.stopLoss, atr, rt.config.useTrailingStop ? capRules.stopLossATR : 999);

          // Profit lock check
          const lock = checkProfitLock(existingPos.side, existingPos.entryPrice, price, existingPos.stopLoss, atr, existingPos.quantity);
          if (lock.action === 'partial_close' && lock.closeQuantity) {
            try {
              const closeSide: Side = existingPos.side === 'LONG' ? 'SHORT' : 'LONG';
              await broker.placeOrder({ symbol, side: closeSide, type: 'market', quantity: lock.closeQuantity });
              existingPos.quantity -= lock.closeQuantity;
              existingPos.stopLoss = lock.newStopLoss ?? existingPos.stopLoss;
              rt.profitLocks++;
              console.log(`  🔒 ${lock.message}`);
            } catch {}
          } else if (lock.action !== 'none' && lock.newStopLoss) {
            existingPos.stopLoss = lock.newStopLoss;
            if (lock.action === 'breakeven') rt.profitLocks++;
            console.log(`  🔒 ${lock.message}`);
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
              const closeSide: Side = existingPos.side === 'LONG' ? 'SHORT' : 'LONG';
              await broker.placeOrder({ symbol, side: closeSide, type: 'market', quantity: existingPos.quantity });
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
              rt.closedTrades.push(trade);
              rt.positions = rt.positions.filter(p => p.symbol !== symbol);
              redisLpush(KEYS.trades, trade, 500).catch(() => {});
              const outcome = buildOutcome({
                tradeId: trade.id, asset: symbol, side: existingPos.side,
                entryPrice: existingPos.entryPrice, exitPrice: price, pnl,
                entryTime: existingPos.entryTime, exitTime: now,
                strategy: existingPos.strategy, confidence: existingPos.confidence,
                regime: 'NORMAL',
                indicators: { rsi: indicators.rsi[lastIdx], macdH: indicators.macd.histogram[lastIdx], adx: indicators.adx[lastIdx] },
              });
              saveOutcome(outcome).catch(() => {});
              await notifyTradeClose(existingPos.side, symbol, price, pnl, exitReason);
            } catch (err: any) { console.error(`  ❌ Exit failed: ${err.message}`); }
          }
          continue;
        }

        // Entry with PRE-TRADE CHECKS + TIMEFRAME CAPITAL RULES
        if (bestSignal.signal !== 'NEUTRAL' && bestSignal.confidence >= 0.70) {
          const side: Side = bestSignal.signal === 'BUY' ? 'LONG' : 'SHORT';
          const atr = indicators.atr[lastIdx] || price * 0.02;

          // Calculate P&L metrics for pre-trade checks
          const totalPnl = rt.closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
          const totalPnlPct = rt.initialEquity > 0 ? (totalPnl / rt.initialEquity) * 100 : 0;
          const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
          const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
          const dailyPnl = rt.closedTrades.filter(t => t.exitAt && new Date(t.exitAt) >= dayStart).reduce((s, t) => s + (t.netPnl ?? 0), 0);
          const weeklyPnl = rt.closedTrades.filter(t => t.exitAt && new Date(t.exitAt) >= weekStart).reduce((s, t) => s + (t.netPnl ?? 0), 0);
          const dailyPnlPct = rt.initialEquity > 0 ? (dailyPnl / rt.initialEquity) * 100 : 0;
          const weeklyPnlPct = rt.initialEquity > 0 ? (weeklyPnl / rt.initialEquity) * 100 : 0;

          // Pre-trade safety checks
          const check = preTradeChecks({
            dailyPnlPct, weeklyPnlPct, totalPnlPct,
            signalScore: Math.round(bestSignal.confidence * 100),
            adaptiveMinScore: 70,
            mtfAlignment: bestSignal.regime,
            calendarBlocked: false,
            newsScore: 0,
            direction: side === 'LONG' ? 'long' : 'short',
            openPositionSymbols: rt.positions.map(p => p.symbol),
            asset: symbol,
          });

          rt.preTradeLog.push({ time: now.toISOString(), asset: symbol, approved: check.approved, reason: check.reason });
          if (rt.preTradeLog.length > 100) rt.preTradeLog = rt.preTradeLog.slice(-50);

          if (!check.approved) {
            logEntry.reason = `pre_trade_rejected: ${check.reason}`;
            rt.rejectedTrades++;
          } else {
            // Timeframe-based position sizing
            const sizing = timeframePositionSize(tradingCapital, mode, atr, price);
            const maxPosByMode = capRules.maxOpenPositions;

            if (sizing.quantity > 0 && sizing.capitalUsed < cash * 0.95 && rt.positions.length < maxPosByMode) {
              const orderQty = parseFloat(sizing.quantity.toFixed(isCrypto(symbol) ? 6 : 0));
              // Override TP/SL with Bollinger calibrated values if available
              const slDist = bollingerOverride ? price * bollingerOverride.slDistPct : sizing.stopDist;
              const tpDist = bollingerOverride ? price * bollingerOverride.tpDistPct : sizing.tpDist;
              const stopLoss = side === 'LONG' ? price - slDist : price + slDist;
              const takeProfit = side === 'LONG' ? price + tpDist : price - tpDist;

              console.log(`  📥 ENTER ${side} ${symbol} @ $${price.toFixed(2)} | ${bollingerOverride ? `BB-calibrated TP=${(bollingerOverride.tpDistPct*100).toFixed(2)}% SL=${(bollingerOverride.slDistPct*100).toFixed(2)}%` : `ATR TP=${capRules.takeProfitATR}xATR SL=${capRules.stopLossATR}xATR`}`);

              try {
                const order = await broker.placeOrder({ symbol, side, type: 'market', quantity: orderQty });
                rt.positions.push({
                  symbol, side, entryPrice: price, quantity: orderQty, orderId: order.id,
                  strategy: bestSignal.strategy as StrategyKey, confidence: bestSignal.confidence,
                  stopLoss, takeProfit, entryTime: now.toISOString(),
                });
                logEntry.acted = true;
                await notifyTrade(bestSignal.signal as 'BUY' | 'SELL', symbol, price, bestSignal.confidence, bestSignal.strategy);
              } catch (err: any) { logEntry.reason = `order_failed: ${err.message}`; }
            } else { logEntry.reason = sizing.quantity <= 0 ? 'size_zero' : rt.positions.length >= maxPosByMode ? 'max_positions' : 'insufficient_cash'; }
          }
        } else if (bestSignal.confidence < 0.70) { logEntry.reason = 'confidence_low'; }

        rt.signalLog.push(logEntry);
        if (rt.signalLog.length > 200) rt.signalLog = rt.signalLog.slice(-100);
        redisLpush(KEYS.signals, logEntry, 500).catch(() => {});
      } catch (err: any) { console.error(`  ❌ ${symbol}: ${err.message}`); }
    }

    // Update stats
    const closed = rt.closedTrades;
    const wins = closed.filter(t => (t.netPnl ?? 0) > 0);
    const totalPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    rt.config.stats = {
      totalTrades: closed.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      pnl: totalPnl,
      pnlPercent: rt.initialEquity > 0 ? (totalPnl / rt.initialEquity) * 100 : 0,
      sharpe: 0,
      maxDrawdown: 0,
    };

    rt.error = null;
    console.log(`✅ Bot "${rt.config.name}" tick #${rt.tickCount} — ${rt.positions.length} pos, ${closed.length} trades`);
    persistAllBots();
  } catch (err: any) {
    rt.error = err.message;
    console.error(`❌ Bot "${rt.config.name}" tick error: ${err.message}`);
  }
}

// ── Persistence ──────────────────────────────────────────

function persistAllBots() {
  const configs = Object.values(bots).map(rt => rt.config);
  redisSet(KEYS.botConfig, configs).catch(() => {});
}

export async function loadSavedBots(): Promise<MultiBotConfig[]> {
  try { return await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? []; } catch { return []; }
}

// Keep backward compat
export async function loadSavedConfig(): Promise<MultiBotConfig | null> {
  const all = await loadSavedBots();
  return all[0] ?? null;
}

export async function wasBotRunning(): Promise<boolean> {
  const all = await loadSavedBots();
  return all.some(b => b.status === 'running');
}

// ── Public API ───────────────────────────────────────────

export async function createBot(input: MultiBotCreateInput): Promise<MultiBotConfig> {
  const config: MultiBotConfig = {
    ...input,
    id: nanoid(10),
    status: 'stopped',
    createdAt: new Date().toISOString(),
    stats: { totalTrades: 0, winRate: 0, pnl: 0, pnlPercent: 0, sharpe: 0, maxDrawdown: 0 },
  };

  bots[config.id] = {
    config, timer: null, positions: [], closedTrades: [], signalLog: [],
    lastTick: null, tickCount: 0, circuitBreaker: { active: false },
    initialEquity: 0, error: null, rejectedTrades: 0, profitLocks: 0, preTradeLog: [],
  };

  persistAllBots();
  return config;
}

export async function startBot(botId: string): Promise<{ ok: boolean; error?: string }> {
  const rt = bots[botId];
  if (!rt) return { ok: false, error: 'Bot not found' };
  if (rt.config.status === 'running') return { ok: false, error: 'Bot already running' };

  try {
    await ensureBroker();
    const { equity } = await refreshBalance();
    rt.initialEquity = equity;
  } catch (err: any) {
    return { ok: false, error: `Alpaca: ${err.message}` };
  }

  rt.config.status = 'running';
  rt.error = null;

  console.log(`🚀 Bot "${rt.config.name}" started — ${rt.config.assets.length} assets`);
  await notifyBot('started', `Bot "${rt.config.name}" — ${rt.config.assets.join(', ')}`);

  // Tick interval based on operation mode
  const intervals: Record<string, number> = { scalp: 60_000, intraday: 300_000, daily: 3600_000 };
  const interval = intervals[rt.config.operationMode ?? 'intraday'] ?? 60_000;

  tickBot(botId);
  rt.timer = setInterval(() => tickBot(botId), interval);

  persistAllBots();
  return { ok: true };
}

export function stopBot(botId?: string): { ok: boolean } {
  if (botId) {
    const rt = bots[botId];
    if (rt) {
      if (rt.timer) { clearInterval(rt.timer); rt.timer = null; }
      const wasRunning = rt.config.status === 'running';
      rt.config.status = 'stopped';
      if (wasRunning) { notifyBot('stopped', `Bot "${rt.config.name}" — ${rt.closedTrades.length} trades`); }
      persistAllBots();
    }
    return { ok: true };
  }
  // Stop all bots (backward compat)
  for (const id of Object.keys(bots)) stopBot(id);
  return { ok: true };
}

export function deleteBot(botId: string): { ok: boolean } {
  const rt = bots[botId];
  if (rt) {
    if (rt.timer) clearInterval(rt.timer);
    delete bots[botId];
    persistAllBots();
  }
  return { ok: true };
}

export function getAllBots(): MultiBotConfig[] {
  return Object.values(bots).map(rt => rt.config);
}

export function getBotRuntime(botId: string): BotRuntime | null {
  return bots[botId] ?? null;
}

export function getBotStatus(botId?: string): BotStatus {
  if (botId && bots[botId]) {
    const rt = bots[botId];
    const { equity, cash } = G.__nexusEquity;
    const totalPnl = rt.closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    return {
      running: rt.config.status === 'running', startedAt: rt.config.createdAt,
      config: rt.config, positions: [...rt.positions], closedTrades: [...rt.closedTrades],
      signalLog: rt.signalLog.slice(-50), lastTick: rt.lastTick, tickCount: rt.tickCount,
      circuitBreaker: { ...rt.circuitBreaker }, accountEquity: equity, accountCash: cash,
      totalPnl, error: rt.error,
      rejectedTrades: rt.rejectedTrades, profitLocks: rt.profitLocks,
      preTradeLog: rt.preTradeLog.slice(-20),
    };
  }
  // Aggregate all bots (backward compat)
  const allPositions = Object.values(bots).flatMap(rt => rt.positions);
  const allTrades = Object.values(bots).flatMap(rt => rt.closedTrades);
  const allSignals = Object.values(bots).flatMap(rt => rt.signalLog).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 50);
  const anyRunning = Object.values(bots).some(rt => rt.config.status === 'running');
  const { equity, cash } = G.__nexusEquity;
  const totalPnl = allTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);

  return {
    running: anyRunning, startedAt: null, config: null,
    positions: allPositions, closedTrades: allTrades, signalLog: allSignals,
    lastTick: null, tickCount: Object.values(bots).reduce((s, rt) => s + rt.tickCount, 0),
    circuitBreaker: { active: false }, accountEquity: equity, accountCash: cash,
    totalPnl, error: null,
    rejectedTrades: Object.values(bots).reduce((s, rt) => s + rt.rejectedTrades, 0),
    profitLocks: Object.values(bots).reduce((s, rt) => s + rt.profitLocks, 0),
    preTradeLog: Object.values(bots).flatMap(rt => rt.preTradeLog).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 20),
  };
}

// ── Legacy startBot (single-bot compat for API routes) ───

export async function startBotLegacy(config: {
  assets: string[]; strategies: string[]; capitalPct: number; riskLevel: number;
  riskPerTrade: number; maxPositions: number; trailingStopATR: number;
  maxDDDaily: number; maxDDWeekly: number; maxDDTotal: number; environment: 'demo' | 'real';
}): Promise<{ ok: boolean; error?: string }> {
  const bot = await createBot({
    name: `Bot ${new Date().toLocaleTimeString('en-US')}`,
    environment: config.environment,
    capitalPercent: config.capitalPct,
    assets: config.assets,
    strategies: config.strategies,
    riskLevel: config.riskLevel,
    stopLossPercent: 3,
    takeProfitPercent: 6,
    useTrailingStop: true,
    maxOpenPositions: config.maxPositions,
    maxDDDaily: config.maxDDDaily,
    maxDDWeekly: config.maxDDWeekly,
    maxDDTotal: config.maxDDTotal,
    operationMode: 'intraday',
  });
  return startBot(bot.id);
}
