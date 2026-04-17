// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Orchestrator (main tick)
//
// Called every 30s by the cron worker via POST /api/nexusone/v2/tick.
// Single entry point: fetch fresh data → features → regime →
// evaluate strategies → risk check → preflight → execute → monitor
// open positions for exit. Every state change is dual-written to
// Redis and Supabase.
// ═══════════════════════════════════════════════════════════════

import { nanoid } from 'nanoid';
import { redisGet, redisSet } from '@/lib/db/redis';
import { fetchOkxCandles, fetchOkxPrice } from '../data/okx';
import { computeFeatures, type OHLCVBar } from './feature-engine';
import { updateRegime, type Regime, type RegimeState } from './regime-detector';
import { isFreshEnough, priceWithinBand } from './data-validators';
import { getCryptoStrategies } from '../strategies-v2/registry';
import type { Strategy, StrategySignal } from '../strategies-v2/strategy.interface';
import { checkCircuit } from '../risk/circuit-breaker';
import { calculatePositionSize } from '../risk/position-sizer';
import { getVenueForAsset } from '../execution/venue-registry';
import { preflightCheck } from '../execution/preflight';
import { dualWriter } from '../persistence/dual-writer';
import {
  closePosition,
  decideExit,
  getOpenPosition,
  openPosition,
  updateTrailing,
} from './position-manager';

const CRYPTO_ASSETS = ['BTC/USD', 'ETH/USD'] as const;
const KEY_LAST_SIGNAL = (strategyId: string, asset: string) =>
  `nexusone:v2:signal:last:${strategyId}:${asset}`;
const KEY_MODE = 'nexusone:v2:mode';

export type V2Mode = 'disabled' | 'paper';

export interface TickResult {
  mode: V2Mode;
  regime: Regime | 'UNKNOWN';
  evaluated: number;
  signals: number;
  executed: number;
  exits: number;
  skipped: string[];
  errors: string[];
  elapsedMs: number;
}

export async function getMode(): Promise<V2Mode> {
  const v = await redisGet<string>(KEY_MODE);
  return v === 'paper' ? 'paper' : 'disabled';
}

export async function setMode(m: V2Mode): Promise<void> {
  await redisSet(KEY_MODE, m);
}

export async function runTick(now: number = Date.now()): Promise<TickResult> {
  const t0 = Date.now();
  const result: TickResult = {
    mode: 'disabled',
    regime: 'UNKNOWN',
    evaluated: 0,
    signals: 0,
    executed: 0,
    exits: 0,
    skipped: [],
    errors: [],
    elapsedMs: 0,
  };

  try {
    const mode = await getMode();
    result.mode = mode;
    if (mode === 'disabled') {
      result.elapsedMs = Date.now() - t0;
      return result;
    }

    // 1) Fetch bars for all assets in parallel.
    const perAsset = await Promise.all(
      CRYPTO_ASSETS.map(async a => {
        const [bars15m, bars1h, priceOkx] = await Promise.all([
          fetchOkxCandles(a, '15m', 100).then(toOhlcv),
          fetchOkxCandles(a, '1h', 120).then(toOhlcv),
          fetchOkxPrice(a),
        ]);
        return { asset: a, bars15m, bars1h, priceOkx };
      }),
    );

    // 2) Freshness gate per asset.
    const ready = perAsset.filter(x => {
      const fresh15 = isFreshEnough(x.bars15m, 15, now);
      const fresh1h = isFreshEnough(x.bars1h, 60, now);
      if (!fresh15 || !fresh1h || x.priceOkx <= 0) {
        result.skipped.push(`${x.asset}: stale (15m=${fresh15}, 1h=${fresh1h}, px=${x.priceOkx})`);
        return false;
      }
      if (x.bars15m[x.bars15m.length - 1].close > 0 && !priceWithinBand(x.bars15m[x.bars15m.length - 1].close, x.priceOkx, 0.01)) {
        // 1% tolerance between last bar close and live ticker (wider than x-venue).
        result.skipped.push(`${x.asset}: bar/ticker divergence`);
        return false;
      }
      return true;
    });

    // 3) Regime from BTC 1h.
    const btc = ready.find(x => x.asset === 'BTC/USD');
    if (!btc) {
      result.regime = 'UNKNOWN';
      result.elapsedMs = Date.now() - t0;
      return result;
    }
    const btc1hFeatures = computeFeatures(btc.bars1h);
    if (!btc1hFeatures) {
      result.skipped.push('BTC 1h features unavailable');
      result.elapsedMs = Date.now() - t0;
      return result;
    }
    const regimeState: RegimeState = await updateRegime(btc1hFeatures);
    const regime = regimeState.current;
    result.regime = regime;

    // 4) Check exits for open positions (independent of regime).
    const venue = getVenueForAsset('BTC/USD');
    const balance = await venue.getBalance();
    const equity = balance.cash + balance.buyingPower * 0 + sumPositionValue(perAsset); // cash-only equity proxy
    const safeEquity = Math.max(balance.cash, 100); // avoid zero-equity divide

    for (const x of ready) {
      const pos = await getOpenPosition(x.asset);
      if (!pos) continue;
      const decision = decideExit(pos, x.priceOkx, now);
      if (decision.updatedTrailing) {
        await updateTrailing(pos, decision.updatedTrailing.active, decision.updatedTrailing.level);
      }
      if (decision.shouldExit && decision.reason) {
        const exitSide = pos.direction === 'long' ? 'sell' : 'buy';
        const clientOrderId = `v2_exit_${nanoid(10)}`;
        const exitResp = await venue.submitOrder({
          asset: x.asset,
          side: exitSide,
          quantity: pos.quantity,
          type: 'market',
          timeInForce: 'gtc',
          clientOrderId,
          metadata: { strategyId: pos.strategy_id, signalId: `exit_${pos.position_id}` },
        });
        await dualWriter.writeOrder({
          order_id: exitResp.orderId,
          signal_id: null,
          asset: x.asset,
          side: exitSide,
          quantity: pos.quantity,
          order_type: 'market',
          limit_price: null,
          status: exitResp.status,
          filled_price: exitResp.filledPrice,
          filled_qty: exitResp.filledQty,
          venue: exitResp.venue,
          latency_ms: exitResp.latencyMs,
          slippage_bps: null,
          rejection_reason: exitResp.rejectionReason,
          is_simulated: exitResp.isSimulated,
        });
        const exitPx = exitResp.filledPrice ?? x.priceOkx;
        await closePosition(pos, exitResp.orderId, exitPx, decision.reason, regime);
        result.exits += 1;
      }
    }

    // 5) Generate fresh signals from active strategies.
    const strategies: Strategy[] = getCryptoStrategies(regime);
    const currentExposure = await estimateExposure(perAsset);

    for (const x of ready) {
      const features = computeFeatures(x.bars15m);
      if (!features) continue;
      result.evaluated += strategies.length;

      const currentPosition = await getOpenPosition(x.asset);
      const openQty = currentPosition ? currentPosition.quantity * (currentPosition.direction === 'short' ? -1 : 1) : 0;

      for (const strat of strategies) {
        const lastTs = (await redisGet<number>(KEY_LAST_SIGNAL(strat.id, x.asset))) ?? null;
        const signal = strat.evaluate(x.asset, features, {
          openPositionsForAsset: openQty,
          lastSignalTs: lastTs,
          now,
          regime,
          recentBars: x.bars15m,
        });
        if (!signal) continue;

        result.signals += 1;
        await dualWriter.writeSignal({
          signal_id: `sig_${nanoid(12)}`,
          strategy_id: signal.strategyId,
          asset: signal.asset,
          direction: signal.direction,
          entry_price: signal.entryPrice,
          stop_loss: signal.stopLoss,
          take_profit: signal.takeProfit,
          rsi: features.rsi_14,
          regime,
          features: signal.featuresSnapshot,
          status: 'generated',
          reason: null,
        });

        // Circuit breaker
        const circuit = await checkCircuit(strat.id, safeEquity);
        if (!circuit.allowed) {
          result.skipped.push(`${signal.strategyId}/${signal.asset}: circuit ${circuit.reason}`);
          continue;
        }

        // Sizing
        const sizing = calculatePositionSize({
          equity: safeEquity,
          currentExposure,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          historicalWinRate: strat.stats.historicalWinRate,
          avgWinLossRatio: strat.stats.avgWinLossRatio,
          sizingMultiplier: circuit.sizingMultiplier,
        });
        if (sizing.notionalUsd <= 0) {
          result.skipped.push(`${signal.strategyId}/${signal.asset}: sizing ${sizing.reason}`);
          continue;
        }

        const qty = roundQty(sizing.quantity, signal.asset);
        if (qty <= 0) {
          result.skipped.push(`${signal.strategyId}/${signal.asset}: qty rounded to 0`);
          continue;
        }

        // Preflight
        const clientOrderId = `v2_${nanoid(10)}`;
        const side = signal.direction === 'long' ? 'buy' : 'sell';
        const preflight = await preflightCheck(
          venue,
          {
            asset: signal.asset,
            side,
            quantity: qty,
            type: 'limit',
            limitPrice: signal.entryPrice,
            timeInForce: 'gtc',
            clientOrderId,
            metadata: { strategyId: signal.strategyId, signalId: clientOrderId },
          },
          x.priceOkx,
        );
        if (!preflight.approved) {
          result.skipped.push(`${signal.strategyId}/${signal.asset}: preflight ${preflight.reason}`);
          continue;
        }

        // Execute
        const execResp = await venue.submitOrder({
          asset: signal.asset,
          side,
          quantity: qty,
          type: 'limit',
          limitPrice: signal.entryPrice,
          timeInForce: 'gtc',
          clientOrderId,
          metadata: { strategyId: signal.strategyId, signalId: clientOrderId },
        });
        await dualWriter.writeOrder({
          order_id: execResp.orderId,
          signal_id: clientOrderId,
          asset: signal.asset,
          side,
          quantity: qty,
          order_type: 'limit',
          limit_price: signal.entryPrice,
          status: execResp.status,
          filled_price: execResp.filledPrice,
          filled_qty: execResp.filledQty,
          venue: execResp.venue,
          latency_ms: execResp.latencyMs,
          slippage_bps: execResp.filledPrice
            ? Math.abs((execResp.filledPrice - signal.entryPrice) / signal.entryPrice) * 10_000
            : null,
          rejection_reason: execResp.rejectionReason,
          is_simulated: execResp.isSimulated,
        });

        if (execResp.status === 'rejected' || execResp.status === 'cancelled') {
          result.skipped.push(`${signal.strategyId}/${signal.asset}: broker ${execResp.rejectionReason}`);
          continue;
        }

        // Record "filled" (real or simulated) → open a position.
        const filledPrice = execResp.filledPrice ?? signal.entryPrice;
        const filledQty = execResp.filledQty ?? qty;
        if (execResp.status === 'filled' || execResp.status === 'simulated_filled' || execResp.status === 'submitted') {
          // For submitted limit orders we optimistically open a provisional position;
          // a subsequent tick will reconcile via getOrderStatus() once the API adds it.
          await openPosition({
            signal,
            entryOrderId: execResp.orderId,
            quantity: filledQty,
            actualEntryPrice: filledPrice,
            regime,
            isSimulated: execResp.isSimulated,
            atrAtEntry: features.atr_14,
          });
          await redisSet(KEY_LAST_SIGNAL(strat.id, x.asset), now, 60 * 60 * 24);
          result.executed += 1;
        }
      }
    }
  } catch (err: any) {
    result.errors.push(err?.message ?? String(err));
  }

  result.elapsedMs = Date.now() - t0;
  return result;
}

function toOhlcv(bars: { ts: number; open: number; high: number; low: number; close: number; volume: number }[]): OHLCVBar[] {
  return bars;
}

function roundQty(q: number, asset: string): number {
  // Crypto on Alpaca accepts 6 decimals; stocks integer shares.
  if (asset.includes('/')) return Math.floor(q * 1e6) / 1e6;
  return Math.floor(q);
}

function sumPositionValue(_perAsset: any[]): number { return 0; /* reserved for mark-to-market */ }

async function estimateExposure(perAsset: { asset: string; priceOkx: number }[]): Promise<number> {
  let total = 0;
  for (const x of perAsset) {
    const pos = await getOpenPosition(x.asset);
    if (pos) total += pos.quantity * x.priceOkx;
  }
  return total;
}
