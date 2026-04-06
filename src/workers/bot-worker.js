#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Standalone Bot Worker
// Runs independently of Next.js as a PM2 managed process.
// Ticks every 60 seconds, reads/writes all state from Redis.
// ═══════════════════════════════════════════════════════════════

require('dotenv').config({ path: '.env.local' });

const TICK_INTERVAL = 60_000;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;
const ALPACA_BASE = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
const TD_KEY = process.env.TWELVE_DATA_API_KEY;

const COIN_MAP = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot' };

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }

// ── Redis helpers ─────────────────────────────────────────

async function redis(cmd) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const d = await res.json();
  return d.result;
}

async function rGet(key) {
  const raw = await redis(['GET', key]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function rSet(key, val, ex) {
  const json = JSON.stringify(val);
  if (ex) await redis(['SET', key, json, 'EX', String(ex)]);
  else await redis(['SET', key, json]);
}

async function rLpush(key, val, max) {
  await redis(['LPUSH', key, JSON.stringify(val)]);
  if (max) await redis(['LTRIM', key, '0', String(max - 1)]);
}

// ── Alpaca helpers ────────────────────────────────────────

const alpacaHeaders = { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET, 'Content-Type': 'application/json' };

async function alpacaGet(path) {
  const res = await fetch(`${ALPACA_BASE}${path}`, { headers: alpacaHeaders });
  if (!res.ok) throw new Error(`Alpaca ${res.status}: ${await res.text()}`);
  return res.json();
}

async function alpacaPost(path, body) {
  const res = await fetch(`${ALPACA_BASE}${path}`, { method: 'POST', headers: alpacaHeaders, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Alpaca ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getBalance() {
  const acc = await alpacaGet('/v2/account');
  return { equity: parseFloat(acc.equity), cash: parseFloat(acc.buying_power) };
}

async function placeOrder(symbol, side, qty) {
  const isCrypto = symbol.includes('/');
  return alpacaPost('/v2/orders', {
    symbol, qty: String(qty), side: side === 'LONG' ? 'buy' : 'sell',
    type: 'market', time_in_force: isCrypto ? 'gtc' : 'day',
  });
}

// ── Data fetching ─────────────────────────────────────────

async function fetchCandles(symbol) {
  if (symbol.includes('/')) {
    const id = COIN_MAP[symbol]; if (!id) return [];
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=250`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.map(x => ({ date: new Date(x[0]).toISOString().slice(0, 10), open: x[1], high: x[2], low: x[3], close: x[4], volume: Math.round(1e6 * (0.5 + Math.random() * 0.8)) }));
    } catch { return []; }
  }
  if (!TD_KEY) return [];
  try {
    const r = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=250&apikey=${TD_KEY}`);
    if (!r.ok) return [];
    const d = await r.json();
    if (d.status === 'error' || !d.values) return [];
    return d.values.reverse().map(v => ({ date: v.datetime.slice(0, 10), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: parseInt(v.volume) || 0 }));
  } catch { return []; }
}

// ── Simplified signal generation (no TS imports needed) ───
// Uses RSI + MACD + EMA cross as a lightweight signal

function computeRSI(closes, period = 14) {
  const gains = []; const losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  if (gains.length < period) return 50;
  let avgGain = gains.slice(0, period).reduce((s, g) => s + g, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, l) => s + l, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function generateSignal(candles) {
  if (candles.length < 50) return { signal: 'NEUTRAL', confidence: 0, strategy: 'worker' };
  const closes = candles.map(c => c.close);
  const rsi = computeRSI(closes);
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const price = closes[closes.length - 1];

  let score = 0;
  if (rsi < 30) score += 2; else if (rsi > 70) score -= 2;
  if (ema9 > ema21) score += 1; else score -= 1;

  const conf = Math.min(Math.abs(score) / 4, 0.95);
  const signal = score > 1.5 ? 'BUY' : score < -1.5 ? 'SELL' : 'NEUTRAL';
  return { signal, confidence: conf, strategy: 'worker_combined' };
}

// ── Capital rules ─────────────────────────────────────────

const CAP_RULES = {
  scalp: { maxCap: 0.05, maxPos: 5, slATR: 0.5, tpATR: 1.0 },
  intraday: { maxCap: 0.03, maxPos: 4, slATR: 1.0, tpATR: 2.0 },
  daily: { maxCap: 0.02, maxPos: 3, slATR: 1.5, tpATR: 3.0 },
};

function getATR(candles, period = 14) {
  if (candles.length < period + 1) return candles[candles.length - 1]?.close * 0.02 || 1;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tr = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1]?.close || 0), Math.abs(candles[i].low - candles[i - 1]?.close || 0));
    sum += tr;
  }
  return sum / period;
}

// ── Notification ──────────────────────────────────────────

async function notify(type, title, message) {
  const notif = { id: `n_${Date.now()}`, type, title, message, read: false, createdAt: new Date().toISOString() };
  await rLpush('nexus:notifications', notif, 200).catch(() => {});
  log(`[NOTIFY] ${title}: ${message}`);

  // Discord webhook
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook) {
    fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [{ title, description: message, color: type === 'trade' ? 0x22c55e : 0x3b82f6, timestamp: new Date().toISOString() }] }),
    }).catch(() => {});
  }
}

// ── Main Tick ─────────────────────────────────────────────

async function tick() {
  const configs = await rGet('nexus:bot_config') || [];
  const running = configs.filter(c => c.status === 'running');

  if (running.length === 0) return;

  let equity, cash;
  try {
    const bal = await getBalance();
    equity = bal.equity; cash = bal.cash;
  } catch (err) {
    log(`❌ Broker error: ${err.message}`);
    return;
  }

  for (const config of running) {
    const stateKey = `nexus:bot:state:${config.id}`;
    const state = await rGet(stateKey) || {
      positions: [], closedTrades: [], signalLog: [], tickCount: 0,
      initialEquity: equity, rejectedTrades: 0, profitLocks: 0, lastTick: '',
    };

    state.tickCount++;
    state.lastTick = new Date().toISOString();
    if (!state.initialEquity) state.initialEquity = equity;

    const mode = config.operationMode || 'intraday';
    const rules = CAP_RULES[mode] || CAP_RULES.intraday;
    const tradingCap = equity * (config.capitalPercent / 100);

    for (const symbol of config.assets) {
      try {
        const candles = await fetchCandles(symbol);
        if (candles.length < 50) { log(`  ⏭  ${symbol}: insufficient data (${candles.length})`); continue; }

        const price = candles[candles.length - 1].close;
        const atr = getATR(candles);
        const sig = generateSignal(candles);

        const logEntry = { botId: config.id, symbol, signal: sig.signal, confidence: sig.confidence, strategy: sig.strategy, price, regime: 'worker', time: new Date().toISOString(), acted: false };

        // Monitor existing position
        const pos = state.positions.find(p => p.symbol === symbol);
        if (pos) {
          // Trailing stop
          if (config.useTrailingStop) {
            const newStop = pos.side === 'LONG' ? price - atr * rules.slATR : price + atr * rules.slATR;
            if (pos.side === 'LONG' && newStop > pos.stopLoss) pos.stopLoss = newStop;
            if (pos.side === 'SHORT' && newStop < pos.stopLoss) pos.stopLoss = newStop;
          }

          // Profit lock: breakeven at +1 ATR
          const mult = pos.side === 'LONG' ? 1 : -1;
          const profit = (price - pos.entryPrice) * mult;
          if (profit > atr && ((pos.side === 'LONG' && pos.entryPrice > pos.stopLoss) || (pos.side === 'SHORT' && pos.entryPrice < pos.stopLoss))) {
            pos.stopLoss = pos.entryPrice;
            state.profitLocks++;
            log(`  🔒 ${symbol}: SL → breakeven`);
          }

          // Check exit
          let exit = false, reason = '';
          if (pos.side === 'LONG' && price <= pos.stopLoss) { exit = true; reason = 'stop_loss'; }
          if (pos.side === 'LONG' && price >= pos.takeProfit) { exit = true; reason = 'take_profit'; }
          if (pos.side === 'SHORT' && price >= pos.stopLoss) { exit = true; reason = 'stop_loss'; }
          if (pos.side === 'SHORT' && price <= pos.takeProfit) { exit = true; reason = 'take_profit'; }

          if (exit) {
            try {
              const closeSide = pos.side === 'LONG' ? 'SHORT' : 'LONG';
              await placeOrder(symbol, closeSide, pos.quantity);
              const pnl = (price - pos.entryPrice) * pos.quantity * mult;
              const trade = {
                id: pos.orderId, symbol, side: pos.side, status: 'closed',
                entryPrice: pos.entryPrice, exitPrice: price,
                quantity: pos.quantity, netPnl: pnl,
                pnlPct: pos.entryPrice > 0 ? (pnl / (pos.quantity * pos.entryPrice)) * 100 : 0,
                entryAt: pos.entryTime, exitAt: new Date().toISOString(),
                strategy: pos.strategy, confidence: pos.confidence, exitReason: reason, isLive: true,
              };
              state.closedTrades.push(trade);
              state.positions = state.positions.filter(p => p.symbol !== symbol);
              await rLpush('nexus:trades', trade, 500);
              const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
              log(`  📤 EXIT ${pos.side} ${symbol} @ $${price.toFixed(2)} — ${reason} — P&L: ${pnlStr}`);
              await notify('trade', `CLOSE ${pos.side} ${symbol} @ $${price.toFixed(2)}`, `P&L: ${pnlStr} | Reason: ${reason}`);
              logEntry.acted = true;
            } catch (err) { log(`  ❌ Exit failed: ${err.message}`); }
          }

          state.signalLog.push(logEntry);
          if (state.signalLog.length > 100) state.signalLog = state.signalLog.slice(-50);
          continue;
        }

        // Entry check
        if (sig.signal !== 'NEUTRAL' && sig.confidence >= 0.70 && state.positions.length < rules.maxPos) {
          // Pre-trade: no duplicate
          if (state.positions.find(p => p.symbol === symbol)) { logEntry.reason = 'duplicate'; state.signalLog.push(logEntry); continue; }

          const side = sig.signal === 'BUY' ? 'LONG' : 'SHORT';
          const maxCap = tradingCap * rules.maxCap;
          const qty = parseFloat((maxCap / price).toFixed(symbol.includes('/') ? 6 : 0));
          const stopDist = atr * rules.slATR;
          const tpDist = atr * rules.tpATR;

          if (qty > 0 && maxCap < cash * 0.95) {
            log(`  📥 ENTER ${side} ${symbol} @ $${price.toFixed(2)} | qty:${qty} mode:${mode} cap:${(rules.maxCap * 100).toFixed(0)}%`);
            try {
              const order = await placeOrder(symbol, side, qty);
              state.positions.push({
                symbol, side, entryPrice: price, quantity: qty, orderId: order.id,
                strategy: sig.strategy, confidence: sig.confidence,
                stopLoss: side === 'LONG' ? price - stopDist : price + stopDist,
                takeProfit: side === 'LONG' ? price + tpDist : price - tpDist,
                entryTime: new Date().toISOString(),
              });
              logEntry.acted = true;
              await notify('trade', `${sig.signal} ${symbol} @ $${price.toFixed(2)}`, `Confidence: ${(sig.confidence * 100).toFixed(0)}% | Strategy: ${sig.strategy}`);
            } catch (err) { logEntry.reason = `order_failed: ${err.message}`; log(`  ❌ Entry failed: ${err.message}`); }
          } else { logEntry.reason = qty <= 0 ? 'size_zero' : 'insufficient_cash'; }
        } else if (sig.confidence < 0.70) { logEntry.reason = 'confidence_low'; }

        state.signalLog.push(logEntry);
        if (state.signalLog.length > 100) state.signalLog = state.signalLog.slice(-50);

        log(`  ${symbol}: ${sig.signal} conf:${(sig.confidence * 100).toFixed(0)}% price:$${price.toFixed(2)} ${logEntry.acted ? '✅ EXECUTED' : logEntry.reason || ''}`);
      } catch (err) { log(`  ❌ ${symbol}: ${err.message}`); }
    }

    // Update stats
    const closed = state.closedTrades;
    const wins = closed.filter(t => (t.netPnl || 0) > 0);
    const totalPnl = closed.reduce((s, t) => s + (t.netPnl || 0), 0);
    config.stats = {
      totalTrades: closed.length, winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      pnl: totalPnl, pnlPercent: state.initialEquity > 0 ? (totalPnl / state.initialEquity) * 100 : 0,
      sharpe: 0, maxDrawdown: 0,
    };
    config.lastTickAt = state.lastTick;

    // Persist
    await rSet(stateKey, state);
    const allConfigs = await rGet('nexus:bot_config') || [];
    const idx = allConfigs.findIndex(c => c.id === config.id);
    if (idx >= 0) { allConfigs[idx] = config; await rSet('nexus:bot_config', allConfigs); }

    log(`✅ Bot "${config.name}" tick #${state.tickCount} — ${state.positions.length} pos, ${closed.length} trades, P&L: $${totalPnl.toFixed(2)}`);
  }
}

// ── Main Loop ─────────────────────────────────────────────

async function main() {
  log('═══════════════════════════════════════');
  log('NEXUS PRO — Bot Worker v5.0');
  log('═══════════════════════════════════════');

  if (!REDIS_URL || !REDIS_TOKEN) { log('❌ UPSTASH_REDIS not configured'); process.exit(1); }
  if (!ALPACA_KEY || !ALPACA_SECRET) { log('❌ ALPACA not configured'); process.exit(1); }

  // Verify connections
  try {
    await redis(['PING']);
    log('✅ Redis connected');
  } catch (err) { log(`❌ Redis failed: ${err.message}`); process.exit(1); }

  try {
    const acc = await alpacaGet('/v2/account');
    log(`✅ Alpaca connected — Equity: $${parseFloat(acc.equity).toLocaleString()}`);
  } catch (err) { log(`❌ Alpaca failed: ${err.message}`); process.exit(1); }

  log(`Tick interval: ${TICK_INTERVAL / 1000}s`);
  log('Waiting for running bots from Redis...');
  log('');

  // First tick
  try { await tick(); } catch (err) { log(`❌ First tick error: ${err.message}`); }

  // Schedule
  setInterval(async () => {
    try { await tick(); } catch (err) { log(`❌ Tick error: ${err.message}`); }
  }, TICK_INTERVAL);
}

main();
