// ═══════════════════════════════════════════════════════════════
// NexusOne — Execution Engine
//
// Translates signals into orders. Maker-first with timeout.
// Logs everything. No discretion — pure execution.
//
// Flow:
//   SignalEvent → RiskCheck → OrderAttempt → Fill/Expire → TradeResult
// ═══════════════════════════════════════════════════════════════

import type { SignalEvent, OrderAttempt, TradeResult } from './types';
import { getActiveStrategy, getSystemMode } from './strategy-registry';
import { checkPreTrade, calculatePositionSize, evaluatePostTrade } from './risk-engine';
import { placeMarketOrder, placeLimitOrder, getOrderStatus, cancelOrder, getAccountInfo } from './order-router';
import { redisGet, redisSet, redisLpush } from '@/lib/db/redis';
import { nanoid } from 'nanoid';

const KEY_OPEN_TRADE = 'nexusone:execution:open_trade';
const KEY_ORDER_LOG = 'nexusone:execution:orders';
const KEY_TRADE_LOG = 'nexusone:execution:trades';
const KEY_PENDING_ORDER = 'nexusone:execution:pending_order';
const LOG_TTL = 30 * 86400; // 30 days
const MAX_LOG = 200;

// ─── Execute a signal ────────────────────────────────────────

export interface ExecutionResult {
  executed: boolean;
  order: OrderAttempt | null;
  reason: string | null;
}

/**
 * Execute a signal event: risk check → place order → log.
 */
export async function executeSignal(signal: SignalEvent): Promise<ExecutionResult> {
  const mode = await getSystemMode();
  if (mode === 'disabled') {
    return { executed: false, order: null, reason: 'system disabled' };
  }

  const strategy = await getActiveStrategy();
  if (!strategy) return { executed: false, order: null, reason: 'no strategy' };

  // Check if we already have an open trade
  const openTrade = await redisGet<TradeResult>(KEY_OPEN_TRADE);
  const openPositions = openTrade && openTrade.status === 'open' ? 1 : 0;

  // Risk check
  const risk = await checkPreTrade(openPositions, strategy.risk.max_open_positions);
  if (!risk.allowed) {
    return { executed: false, order: null, reason: risk.reason };
  }

  // Get account info for sizing
  const account = await getAccountInfo();
  if (!account) return { executed: false, order: null, reason: 'broker unreachable' };

  // Calculate size
  const sizing = calculatePositionSize(account.equity);
  const price = signal.feature_snapshot.close;
  if (!price || price <= 0) return { executed: false, order: null, reason: 'no price' };

  const quantity = sizing.notional / price;
  if (quantity <= 0) return { executed: false, order: null, reason: 'quantity zero' };

  // Round quantity for crypto
  const roundedQty = parseFloat(quantity.toFixed(6));

  // Determine side
  const side: 'long' | 'short' = signal.direction;

  // Place order
  const startMs = Date.now();
  let orderResult;

  if (strategy.execution.mode === 'maker_first') {
    // Maker-first: place limit order at current price
    orderResult = await placeLimitOrder(
      signal.symbol.replace('-', '/'), // BTC-USD → BTC/USD for Alpaca
      side,
      roundedQty,
      price,
    );
  } else {
    orderResult = await placeMarketOrder(
      signal.symbol.replace('-', '/'),
      side,
      roundedQty,
    );
  }

  const latencyMs = Date.now() - startMs;

  // Build order attempt
  const order: OrderAttempt = {
    id: nanoid(12),
    signal_event_id: signal.id,
    order_type: strategy.execution.mode === 'maker_first' ? 'limit' : 'market',
    side: side === 'long' ? 'buy' : 'sell',
    intended_price: price,
    actual_price: orderResult.filledPrice,
    quantity: roundedQty,
    fee_bps: 0, // will be filled from broker
    slippage_bps: orderResult.filledPrice
      ? Math.abs((orderResult.filledPrice - price) / price) * 10000
      : 0,
    fill_status: orderResult.success
      ? (orderResult.filledPrice ? 'filled' : 'pending')
      : 'rejected',
    broker_order_id: orderResult.orderId,
    latency_ms: latencyMs,
    created_at: Date.now(),
  };

  // Log order
  await redisLpush(KEY_ORDER_LOG, order, MAX_LOG);

  if (!orderResult.success) {
    console.error(`[nexusone-exec] ORDER REJECTED: ${orderResult.error}`);
    return { executed: false, order, reason: orderResult.error };
  }

  // If filled immediately, create trade
  if (orderResult.filledPrice) {
    const trade = await openTradeFromFill(signal, order, orderResult.filledPrice, roundedQty);
    console.log(`[nexusone-exec] TRADE OPENED: ${signal.direction} ${signal.symbol} @ ${orderResult.filledPrice} qty=${roundedQty}`);
    return { executed: true, order, reason: null };
  }

  // If limit order pending, save for monitoring
  if (order.fill_status === 'pending' && order.broker_order_id) {
    await redisSet(KEY_PENDING_ORDER, {
      order,
      signal,
      expires_at: Date.now() + strategy.execution.max_entry_wait_bars * 5 * 60_000,
    }, LOG_TTL);
    console.log(`[nexusone-exec] LIMIT ORDER PENDING: ${signal.symbol} @ ${price}`);
  }

  return { executed: true, order, reason: null };
}

// ─── Trade Management ────────────────────────────────────────

async function openTradeFromFill(
  signal: SignalEvent,
  order: OrderAttempt,
  fillPrice: number,
  quantity: number,
): Promise<TradeResult> {
  const trade: TradeResult = {
    id: nanoid(12),
    signal_event_id: signal.id,
    strategy_id: signal.strategy_id,
    symbol: signal.symbol,
    direction: signal.direction,
    entry_ts: Date.now(),
    exit_ts: null,
    entry_price: fillPrice,
    exit_price: null,
    quantity,
    gross_bps: 0,
    net_bps: 0,
    fees_bps: 0,
    reason_exit: null,
    max_adverse_excursion_bps: 0,
    max_favorable_excursion_bps: 0,
    status: 'open',
    created_at: Date.now(),
  };

  await redisSet(KEY_OPEN_TRADE, trade, LOG_TTL);
  // Update signal status
  signal.status = 'filled';
  await redisSet(`nexusone:signal:${signal.id}`, signal, LOG_TTL);
  return trade;
}

/**
 * Monitor open trade: check exit conditions.
 * Called every tick by execution worker.
 */
export async function monitorOpenTrade(currentPrice: number): Promise<{
  action: 'hold' | 'close';
  reason?: string;
}> {
  const trade = await redisGet<TradeResult>(KEY_OPEN_TRADE);
  if (!trade || trade.status !== 'open') return { action: 'hold' };

  const strategy = await getActiveStrategy();
  if (!strategy) return { action: 'close', reason: 'no strategy' };

  // Update MAE/MFE
  const pnlBps = trade.direction === 'long'
    ? ((currentPrice - trade.entry_price) / trade.entry_price) * 10000
    : ((trade.entry_price - currentPrice) / trade.entry_price) * 10000;

  trade.max_favorable_excursion_bps = Math.max(trade.max_favorable_excursion_bps, pnlBps);
  trade.max_adverse_excursion_bps = Math.min(trade.max_adverse_excursion_bps, pnlBps);

  // Time-based exit: hold_bars exceeded
  const holdMs = strategy.execution.hold_bars *
    (strategy.timeframe === '5m' ? 5 * 60_000 : 60 * 60_000);
  if (Date.now() - trade.entry_ts >= holdMs) {
    return { action: 'close', reason: 'time_exit' };
  }

  // Save updated MAE/MFE
  await redisSet(KEY_OPEN_TRADE, trade, LOG_TTL);
  return { action: 'hold' };
}

/**
 * Close the open trade.
 */
export async function closeTrade(
  currentPrice: number,
  reason: TradeResult['reason_exit'],
): Promise<TradeResult | null> {
  const trade = await redisGet<TradeResult>(KEY_OPEN_TRADE);
  if (!trade || trade.status !== 'open') return null;

  // Place exit order (market)
  const exitSide = trade.direction === 'long' ? 'short' : 'long';
  const result = await placeMarketOrder(
    trade.symbol.replace('-', '/'),
    exitSide,
    trade.quantity,
  );

  const exitPrice = result.filledPrice ?? currentPrice;
  const grossBps = trade.direction === 'long'
    ? ((exitPrice - trade.entry_price) / trade.entry_price) * 10000
    : ((trade.entry_price - exitPrice) / trade.entry_price) * 10000;

  // Estimate fees (0.1% each side = 20bps total)
  const feesBps = 20;
  const netBps = grossBps - feesBps;

  trade.exit_ts = Date.now();
  trade.exit_price = exitPrice;
  trade.gross_bps = Math.round(grossBps * 100) / 100;
  trade.net_bps = Math.round(netBps * 100) / 100;
  trade.fees_bps = feesBps;
  trade.reason_exit = reason;
  trade.status = 'closed';

  // Save closed trade
  await redisSet(KEY_OPEN_TRADE, null);
  await redisLpush(KEY_TRADE_LOG, trade, MAX_LOG);

  console.log(`[nexusone-exec] TRADE CLOSED: ${trade.direction} ${trade.symbol} gross=${trade.gross_bps}bps net=${trade.net_bps}bps reason=${reason}`);

  return trade;
}

/**
 * Check pending limit order status.
 */
export async function checkPendingOrder(): Promise<void> {
  const pending = await redisGet<{
    order: OrderAttempt;
    signal: SignalEvent;
    expires_at: number;
  }>(KEY_PENDING_ORDER);

  if (!pending) return;

  // Expired?
  if (Date.now() > pending.expires_at) {
    if (pending.order.broker_order_id) {
      await cancelOrder(pending.order.broker_order_id);
    }
    pending.order.fill_status = 'expired';
    await redisLpush(KEY_ORDER_LOG, pending.order, MAX_LOG);
    await redisSet(KEY_PENDING_ORDER, null);
    console.log(`[nexusone-exec] LIMIT ORDER EXPIRED: ${pending.signal.symbol}`);
    return;
  }

  // Check fill
  if (pending.order.broker_order_id) {
    const status = await getOrderStatus(pending.order.broker_order_id);
    if (status?.status === 'filled') {
      pending.order.fill_status = 'filled';
      pending.order.actual_price = status.filledPrice ?? pending.order.intended_price;
      pending.order.slippage_bps = Math.abs(
        ((pending.order.actual_price - pending.order.intended_price) / pending.order.intended_price) * 10000
      );
      await redisLpush(KEY_ORDER_LOG, pending.order, MAX_LOG);
      await redisSet(KEY_PENDING_ORDER, null);
      await openTradeFromFill(pending.signal, pending.order, pending.order.actual_price, pending.order.quantity);
      console.log(`[nexusone-exec] LIMIT ORDER FILLED: ${pending.signal.symbol} @ ${pending.order.actual_price}`);
    }
  }
}

// ─── Data Access ─────────────────────────────────────────────

export async function getOpenTrade(): Promise<TradeResult | null> {
  return redisGet<TradeResult>(KEY_OPEN_TRADE);
}

export async function getRecentTrades(limit: number = 50): Promise<TradeResult[]> {
  const { redisLrange } = await import('@/lib/db/redis');
  return redisLrange<TradeResult>(KEY_TRADE_LOG, 0, limit - 1);
}

export async function getRecentOrders(limit: number = 50): Promise<OrderAttempt[]> {
  const { redisLrange } = await import('@/lib/db/redis');
  return redisLrange<OrderAttempt>(KEY_ORDER_LOG, 0, limit - 1);
}
