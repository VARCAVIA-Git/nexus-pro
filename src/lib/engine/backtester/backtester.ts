// ═══════════════════════════════════════════════════════════════
// Multi-Asset Backtester
// Walks chronologically across all assets in parallel.
// Money management with correlation groups, ATR-based TP/SL.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Indicators } from '@/types';
import { computeIndicators } from '@/lib/engine/indicators';
import { getAllRunnableStrategies, type RunnableStrategy } from '@/lib/engine/rnd/strategy-runner';
import { createDeepMapStrategy } from './deepmap-source';
import { createBollingerStrategy } from './bollinger-source';
import {
  sizePosition, type MMConfig, DEFAULT_MM, type OpenPosition, getGroup,
} from './money-management';

export type SignalSource = 'strategies' | 'deepmap' | 'bollinger' | 'both';

export interface BacktesterConfig {
  assets: string[];
  months: number;             // history length
  initialCapital: number;
  riskPerTrade: number;       // % per trade
  tpMultiplier: number;       // ATR × tpMultiplier = TP distance (default 3)
  slMultiplier: number;       // ATR × slMultiplier = SL distance (default 1.5)
  maxBarsHold: number;        // timeout (default 48 = 2 days on 1h)
  minConfidence: number;      // minimum signal confidence to enter (default 0.55)
  signalSource: SignalSource; // strategies | deepmap | both
}

export const DEFAULT_BT_CONFIG: BacktesterConfig = {
  assets: ['BTC/USD', 'ETH/USD'],
  months: 3,
  initialCapital: 10000,
  riskPerTrade: 1.5,
  tpMultiplier: 3,
  slMultiplier: 1.5,
  maxBarsHold: 48,
  minConfidence: 0.55,
  signalSource: 'strategies',
};

export interface BacktestTrade {
  asset: string;
  group: string;
  side: 'long' | 'short';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  sizeUsd: number;
  pnl: number;
  pnlPct: number;
  exitReason: 'tp' | 'sl' | 'timeout';
  strategy: string;
  durationBars: number;
}

export interface BacktestStats {
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  calmarRatio: number;
  sortinoRatio: number;
  expectancy: number;
}

export interface BacktestResult {
  config: BacktesterConfig;
  startedAt: string;
  finishedAt: string;
  stats: BacktestStats;
  equityCurve: { time: number; value: number; drawdown: number }[];
  trades: BacktestTrade[];
  perAsset: Record<string, { trades: number; wins: number; pnl: number; winRate: number; avgReturn: number }>;
  monthly: { month: string; trades: number; wins: number; pnl: number; winRate: number }[];
  perStrategy: Record<string, { trades: number; wins: number; pnl: number; winRate: number; avgReturn: number }>;
  rejectionStats: Record<string, number>;
  deepMapStats?: { loaded: number; skipped: number };
  verdict: 'GREEN' | 'YELLOW' | 'RED';
  verdictReason: string;
}

interface AssetState {
  asset: string;
  candles: OHLCV[];
  indicators: Indicators;
  strategies: RunnableStrategy[];
}

// ── Fetch + prepare assets ──

// ── Robust Alpaca fetcher: explicit date range + pagination + IEX feed for stocks ──
const ALPACA_DATA = 'https://data.alpaca.markets';

function alpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? process.env.ALPACA_SECRET_KEY ?? '',
  };
}

async function fetchAssetData(asset: string, months: number): Promise<OHLCV[]> {
  const headers = alpacaHeaders();
  if (!headers['APCA-API-KEY-ID']) {
    console.log('[BACKTESTER] No Alpaca API key configured');
    return [];
  }

  const crypto = asset.includes('/');
  const end = new Date(Date.now() - 16 * 60000); // 16 min ago — free tier SIP restriction
  const start = new Date(end.getTime() - months * 30 * 86400000);

  const all: OHLCV[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  const MAX_PAGES = 10;

  do {
    const params = new URLSearchParams({
      timeframe: '1Hour',
      start: start.toISOString(),
      end: end.toISOString(),
      limit: '10000',
    });
    if (crypto) {
      params.set('symbols', asset);
    } else {
      params.set('feed', 'iex'); // free tier requires IEX feed for recent stock data
      params.set('adjustment', 'split');
    }
    if (pageToken) params.set('page_token', pageToken);

    const baseUrl = crypto
      ? `${ALPACA_DATA}/v1beta3/crypto/us/bars`
      : `${ALPACA_DATA}/v2/stocks/${asset}/bars`;

    try {
      const res = await fetch(`${baseUrl}?${params}`, { headers });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.log(`[BACKTESTER] ${asset}: HTTP ${res.status} ${txt.slice(0, 200)}`);
        break;
      }
      const data = await res.json();
      const bars = crypto ? (data.bars?.[asset] ?? []) : (data.bars ?? []);
      for (const b of bars) {
        all.push({
          date: new Date(b.t).toISOString(),
          open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
        });
      }
      pageToken = data.next_page_token ?? null;
      pages++;
      if (pages >= MAX_PAGES) break;
      if (pageToken) await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      console.log(`[BACKTESTER] ${asset} fetch error: ${err.message}`);
      break;
    }
  } while (pageToken);

  const sorted = all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  console.log(`[BACKTESTER] ${asset}: ${sorted.length} bars (${pages} pages, ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)})`);
  return sorted;
}

async function prepareAssets(
  assets: string[],
  months: number,
  signalSource: SignalSource,
  onProgress?: (msg: string) => void,
): Promise<{ states: AssetState[]; failures: string[]; deepMapStats: { loaded: number; skipped: number } }> {
  const states: AssetState[] = [];
  const failures: string[] = [];
  let dmLoaded = 0, dmSkipped = 0;

  for (const asset of assets) {
    onProgress?.(`Fetching ${asset}...`);
    const candles = await fetchAssetData(asset, months);
    if (candles.length < 100) {
      const msg = `${asset}: ${candles.length} bars (need 100+)`;
      failures.push(msg);
      onProgress?.(`Skipping ${msg}`);
      continue;
    }
    const indicators = computeIndicators(candles);

    let strategies: RunnableStrategy[] = [];
    if (signalSource === 'strategies' || signalSource === 'both') {
      strategies = strategies.concat(getAllRunnableStrategies(indicators));
    }
    if (signalSource === 'deepmap' || signalSource === 'both') {
      const dm = await createDeepMapStrategy(asset, indicators);
      if (dm) {
        strategies.push(dm);
        dmLoaded++;
        onProgress?.(`${asset}: Deep Map rules loaded`);
      } else {
        dmSkipped++;
        onProgress?.(`${asset}: no Deep Map rules`);
      }
    }
    if (signalSource === 'bollinger' || signalSource === 'both') {
      const bb = await createBollingerStrategy(asset, candles, indicators);
      if (bb) {
        strategies.push(bb);
        onProgress?.(`${asset}: Bollinger profile loaded`);
      } else {
        onProgress?.(`${asset}: no Bollinger profile (train it first)`);
      }
    }

    if (strategies.length === 0) {
      failures.push(`${asset}: no signal source available`);
      continue;
    }

    states.push({ asset, candles, indicators, strategies });
    onProgress?.(`Loaded ${asset}: ${candles.length} bars, ${strategies.length} strategies`);
  }
  return { states, failures, deepMapStats: { loaded: dmLoaded, skipped: dmSkipped } };
}

// ── Build unified timeline ──

interface TimelineBar {
  time: number;        // ms timestamp
  bars: Map<string, { idx: number; ohlcv: OHLCV }>;
}

function buildTimeline(states: AssetState[]): TimelineBar[] {
  // Index each candle by its timestamp ms
  const timeMap = new Map<number, TimelineBar>();
  for (const state of states) {
    for (let i = 0; i < state.candles.length; i++) {
      const c = state.candles[i];
      const t = new Date(c.date).getTime();
      if (isNaN(t)) continue;
      // Normalize to hour bucket
      const hourBucket = Math.floor(t / 3600000) * 3600000;
      let bar = timeMap.get(hourBucket);
      if (!bar) {
        bar = { time: hourBucket, bars: new Map() };
        timeMap.set(hourBucket, bar);
      }
      bar.bars.set(state.asset, { idx: i, ohlcv: c });
    }
  }
  return Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
}

// ── Simulate one bar of an open position ──

function checkExit(
  pos: OpenPosition,
  bar: OHLCV,
  i: number,
  config: BacktesterConfig,
): { exit: boolean; reason: 'tp' | 'sl' | 'timeout' | null; price: number } {
  if (pos.side === 'long') {
    // SL hit (intracandle low)
    if (bar.low <= pos.stopLoss) return { exit: true, reason: 'sl', price: pos.stopLoss };
    // TP hit (intracandle high)
    if (bar.high >= pos.takeProfit) return { exit: true, reason: 'tp', price: pos.takeProfit };
  } else {
    if (bar.high >= pos.stopLoss) return { exit: true, reason: 'sl', price: pos.stopLoss };
    if (bar.low <= pos.takeProfit) return { exit: true, reason: 'tp', price: pos.takeProfit };
  }
  // Timeout
  if (i - pos.entryBarIndex >= config.maxBarsHold) {
    return { exit: true, reason: 'timeout', price: bar.close };
  }
  return { exit: false, reason: null, price: 0 };
}

// ── Compute stats from trade list + equity curve ──

function computeStats(
  trades: BacktestTrade[],
  equityCurve: { time: number; value: number; drawdown: number }[],
  initial: number,
): BacktestStats {
  const final = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value : initial;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  // drawdown values are stored as negative (e.g. -3.5%); the worst is the most negative.
  // Math.min returns the most negative number; abs() converts to positive %
  const minDrawdown = equityCurve.length > 0 ? Math.min(...equityCurve.map(e => e.drawdown)) : 0;
  const maxDrawdown = minDrawdown; // most negative = worst
  const maxDrawdownPct = Math.abs(minDrawdown);

  // Daily returns from equity curve
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const r = equityCurve[i - 1].value > 0 ? (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value : 0;
    dailyReturns.push(r);
  }
  const avgRet = dailyReturns.length > 0 ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length : 0;
  const stdRet = dailyReturns.length > 1 ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgRet) ** 2, 0) / (dailyReturns.length - 1)) : 0;
  const downRet = dailyReturns.filter(r => r < 0);
  const downStd = downRet.length > 1 ? Math.sqrt(downRet.reduce((s, r) => s + r ** 2, 0) / downRet.length) : 0;
  const sharpeRatio = stdRet > 0 ? (avgRet / stdRet) * Math.sqrt(24 * 252) : 0;
  const sortinoRatio = downStd > 0 ? (avgRet / downStd) * Math.sqrt(24 * 252) : 0;
  const totalReturnPct = ((final - initial) / initial) * 100;
  const calmarRatio = maxDrawdownPct > 0 ? totalReturnPct / maxDrawdownPct : totalReturnPct;
  const expectancy = trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0;

  return {
    initialCapital: initial,
    finalCapital: final,
    totalReturn: final - initial,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: Math.round(winRate * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
  };
}

function computeVerdict(stats: BacktestStats): { verdict: 'GREEN' | 'YELLOW' | 'RED'; reason: string } {
  if (stats.totalTrades < 10) return { verdict: 'RED', reason: `Solo ${stats.totalTrades} trade — non statisticamente significativo` };
  if (stats.winRate >= 55 && stats.totalReturnPct >= 5 && stats.profitFactor >= 1.3) {
    return { verdict: 'GREEN', reason: `WR ${stats.winRate}% + Return ${stats.totalReturnPct}% + PF ${stats.profitFactor} — edge confermato` };
  }
  if (stats.totalReturnPct < 0 || stats.profitFactor < 1) {
    return { verdict: 'RED', reason: `Return ${stats.totalReturnPct}%, PF ${stats.profitFactor} — strategia perdente` };
  }
  return { verdict: 'YELLOW', reason: `WR ${stats.winRate}%, Return ${stats.totalReturnPct}%, PF ${stats.profitFactor} — marginale, iterare` };
}

// ── Main backtest function ──

export async function runMultiAssetBacktest(
  config: BacktesterConfig,
  onProgress?: (phase: string, pct: number, message: string) => void,
): Promise<BacktestResult> {
  const startedAt = new Date().toISOString();
  onProgress?.('init', 0, 'Initializing backtest...');

  // 1. Fetch + prepare all assets
  onProgress?.('fetching', 5, 'Fetching market data...');
  const { states, failures, deepMapStats } = await prepareAssets(
    config.assets, config.months, config.signalSource ?? 'strategies',
    msg => onProgress?.('fetching', 10, msg),
  );
  if (states.length === 0) {
    const reason = failures.length > 0 ? failures.join('; ') : 'all assets returned 0 bars';
    throw new Error(`No valid asset data fetched: ${reason}. Check Alpaca API keys and asset symbols.`);
  }
  if (failures.length > 0) {
    console.log(`[BACKTESTER] Skipped ${failures.length} assets: ${failures.join(', ')}`);
  }
  console.log(`[BACKTESTER] Signal source: ${config.signalSource ?? 'strategies'} (DeepMap loaded: ${deepMapStats.loaded}, skipped: ${deepMapStats.skipped})`);

  // 2. Build unified timeline
  onProgress?.('preparing', 20, 'Building timeline...');
  const timeline = buildTimeline(states);
  console.log(`[BACKTESTER] Timeline: ${timeline.length} bars across ${states.length} assets`);
  if (timeline.length < 50) throw new Error(`Insufficient timeline: ${timeline.length} bars`);

  // 3. Simulate
  onProgress?.('simulating', 25, `Simulating ${timeline.length} bars...`);

  const mmConfig: MMConfig = {
    ...DEFAULT_MM,
    initialCapital: config.initialCapital,
    riskPerTrade: config.riskPerTrade,
  };

  let equity = config.initialCapital;
  let peakEquity = equity;
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; value: number; drawdown: number }[] = [];
  let openPositions: OpenPosition[] = [];
  const rejectionStats: Record<string, number> = {};

  // Build a per-state index lookup for fast access
  const stateByAsset = new Map<string, AssetState>();
  for (const s of states) stateByAsset.set(s.asset, s);

  let bar = 0;
  const TIMELINE_LEN = timeline.length;
  const PROGRESS_STEP = Math.max(1, Math.floor(TIMELINE_LEN / 50));

  for (const tb of timeline) {
    bar++;

    // ── PHASE 1: Update + close existing positions ──
    const stillOpen: OpenPosition[] = [];
    for (const pos of openPositions) {
      const assetBar = tb.bars.get(pos.asset);
      if (!assetBar) { stillOpen.push(pos); continue; }
      const exit = checkExit(pos, assetBar.ohlcv, assetBar.idx, config);
      if (!exit.exit) { stillOpen.push(pos); continue; }

      // Close trade
      const mult = pos.side === 'long' ? 1 : -1;
      const pnl = (exit.price - pos.entryPrice) * pos.quantity * mult;
      const pnlPct = pos.entryPrice > 0 ? ((exit.price - pos.entryPrice) / pos.entryPrice) * 100 * mult : 0;
      equity += pnl;

      trades.push({
        asset: pos.asset, group: getGroup(pos.asset),
        side: pos.side,
        entryTime: pos.entryTime, entryPrice: pos.entryPrice,
        exitTime: tb.time, exitPrice: exit.price,
        quantity: pos.quantity, sizeUsd: pos.sizeUsd,
        pnl: Math.round(pnl * 100) / 100,
        pnlPct: Math.round(pnlPct * 100) / 100,
        exitReason: exit.reason!,
        strategy: pos.strategy ?? 'unknown',
        durationBars: assetBar.idx - pos.entryBarIndex,
      });
    }
    openPositions = stillOpen;

    // ── PHASE 2: Look for new entries ──
    if (openPositions.length < mmConfig.maxOpenPositions) {
      for (const [asset, assetBar] of tb.bars) {
        if (openPositions.length >= mmConfig.maxOpenPositions) break;
        const state = stateByAsset.get(asset);
        if (!state) continue;
        if (assetBar.idx < 50) continue; // need warmup
        if (openPositions.find(p => p.asset === asset)) continue;

        // Find best signal across strategies
        let bestSig: { dir: 'BUY' | 'SELL'; conf: number; strat: string } | null = null;
        for (const s of state.strategies) {
          const sig = s.run(state.candles, assetBar.idx);
          const conf = sig.confidence / 100;
          if (sig.direction === 'HOLD' || conf < config.minConfidence) continue;
          if (!bestSig || conf > bestSig.conf) {
            bestSig = { dir: sig.direction, conf, strat: s.name };
          }
        }
        if (!bestSig) continue;

        // ATR-based SL/TP
        const atr = state.indicators.atr[assetBar.idx] ?? assetBar.ohlcv.close * 0.01;
        const slDist = atr * config.slMultiplier;
        const tpDist = atr * config.tpMultiplier;
        const price = assetBar.ohlcv.close;

        const sized = sizePosition(equity, asset, price, slDist, mmConfig, openPositions);
        if (!sized.approved) {
          rejectionStats[sized.reason] = (rejectionStats[sized.reason] ?? 0) + 1;
          continue;
        }

        const side = bestSig.dir === 'BUY' ? 'long' : 'short';
        openPositions.push({
          asset, side,
          entryPrice: price, quantity: sized.quantity, sizeUsd: sized.sizeUsd,
          stopLoss: side === 'long' ? price - slDist : price + slDist,
          takeProfit: side === 'long' ? price + tpDist : price - tpDist,
          entryTime: tb.time,
          entryBarIndex: assetBar.idx,
          strategy: bestSig.strat,
        });
      }
    }

    // Track equity (mark-to-market open positions)
    let openMtm = 0;
    for (const pos of openPositions) {
      const assetBar = tb.bars.get(pos.asset);
      if (!assetBar) continue;
      const mult = pos.side === 'long' ? 1 : -1;
      openMtm += (assetBar.ohlcv.close - pos.entryPrice) * pos.quantity * mult;
    }
    const totalEquity = equity + openMtm;
    if (totalEquity > peakEquity) peakEquity = totalEquity;
    const drawdown = peakEquity > 0 ? ((totalEquity - peakEquity) / peakEquity) * 100 : 0;
    equityCurve.push({ time: tb.time, value: totalEquity, drawdown });

    if (bar % PROGRESS_STEP === 0) {
      const pct = 25 + Math.round((bar / TIMELINE_LEN) * 65);
      onProgress?.('simulating', pct, `Bar ${bar}/${TIMELINE_LEN} · equity $${totalEquity.toFixed(0)} · ${trades.length} trades`);
    }
  }

  // Close all remaining open positions at last price
  for (const pos of openPositions) {
    const lastBar = stateByAsset.get(pos.asset)?.candles.slice(-1)[0];
    if (!lastBar) continue;
    const mult = pos.side === 'long' ? 1 : -1;
    const pnl = (lastBar.close - pos.entryPrice) * pos.quantity * mult;
    const pnlPct = pos.entryPrice > 0 ? ((lastBar.close - pos.entryPrice) / pos.entryPrice) * 100 * mult : 0;
    equity += pnl;
    trades.push({
      asset: pos.asset, group: getGroup(pos.asset),
      side: pos.side,
      entryTime: pos.entryTime, entryPrice: pos.entryPrice,
      exitTime: timeline[timeline.length - 1].time,
      exitPrice: lastBar.close,
      quantity: pos.quantity, sizeUsd: pos.sizeUsd,
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: Math.round(pnlPct * 100) / 100,
      exitReason: 'timeout',
      strategy: pos.strategy ?? 'unknown',
      durationBars: 0,
    });
  }

  // 4. Stats + breakdowns
  onProgress?.('finalizing', 95, 'Computing statistics...');

  const stats = computeStats(trades, equityCurve, config.initialCapital);

  // Per-asset breakdown
  const perAsset: BacktestResult['perAsset'] = {};
  for (const t of trades) {
    if (!perAsset[t.asset]) perAsset[t.asset] = { trades: 0, wins: 0, pnl: 0, winRate: 0, avgReturn: 0 };
    const a = perAsset[t.asset];
    a.trades++;
    if (t.pnl > 0) a.wins++;
    a.pnl += t.pnl;
    a.avgReturn += t.pnlPct;
  }
  for (const a of Object.values(perAsset)) {
    a.winRate = a.trades > 0 ? Math.round((a.wins / a.trades) * 100) : 0;
    a.avgReturn = a.trades > 0 ? Math.round((a.avgReturn / a.trades) * 100) / 100 : 0;
    a.pnl = Math.round(a.pnl * 100) / 100;
  }

  // Monthly breakdown
  const monthlyMap: Record<string, { trades: number; wins: number; pnl: number }> = {};
  for (const t of trades) {
    const month = new Date(t.exitTime).toISOString().slice(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = { trades: 0, wins: 0, pnl: 0 };
    monthlyMap[month].trades++;
    if (t.pnl > 0) monthlyMap[month].wins++;
    monthlyMap[month].pnl += t.pnl;
  }
  const monthly = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, m]) => ({
    month, trades: m.trades, wins: m.wins,
    pnl: Math.round(m.pnl * 100) / 100,
    winRate: m.trades > 0 ? Math.round((m.wins / m.trades) * 100) : 0,
  }));

  // Per-strategy breakdown
  const perStrategy: BacktestResult['perStrategy'] = {};
  for (const t of trades) {
    const k = t.strategy;
    if (!perStrategy[k]) perStrategy[k] = { trades: 0, wins: 0, pnl: 0, winRate: 0, avgReturn: 0 };
    const s = perStrategy[k];
    s.trades++;
    if (t.pnl > 0) s.wins++;
    s.pnl += t.pnl;
    s.avgReturn += t.pnlPct;
  }
  for (const s of Object.values(perStrategy)) {
    s.winRate = s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0;
    s.avgReturn = s.trades > 0 ? Math.round((s.avgReturn / s.trades) * 100) / 100 : 0;
    s.pnl = Math.round(s.pnl * 100) / 100;
  }

  const { verdict, reason } = computeVerdict(stats);
  onProgress?.('done', 100, `Complete: ${stats.totalTrades} trades, ${stats.totalReturnPct}% return`);

  return {
    config,
    startedAt,
    finishedAt: new Date().toISOString(),
    stats,
    equityCurve,
    trades,
    perAsset,
    monthly,
    perStrategy,
    rejectionStats,
    deepMapStats,
    verdict,
    verdictReason: reason,
  };
}
