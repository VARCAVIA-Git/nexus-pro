// ═══════════════════════════════════════════════════════════════
// Phase 4 — Execution Layer
//
// Thin wrapper over the existing BrokerAdapter (Alpaca) for
// mine-specific operations. All methods catch errors and return
// structured results — the mine-tick never crashes from a broker
// failure.
// ═══════════════════════════════════════════════════════════════

import { createDefaultBrokerAsync } from '@/lib/broker';
import type { BrokerAdapter } from '@/lib/broker/base';
import type { BrokerOrder, BrokerBalance, Side } from '@/types';

export interface OrderResult {
  success: boolean;
  orderId: string | null;
  filledPrice: number | null;
  filledQty: number | null;
  status: BrokerOrder['status'] | null;
  error: string | null;
}

export interface AccountInfo {
  equity: number;
  buyingPower: number;
  cash: number;
}

/** Lazy-init singleton broker instance (async — resolves live keys from Redis). */
let _broker: BrokerAdapter | null = null;
let _brokerInitPromise: Promise<BrokerAdapter> | null = null;

async function getBroker(): Promise<BrokerAdapter> {
  if (_broker) return _broker;
  if (!_brokerInitPromise) {
    _brokerInitPromise = createDefaultBrokerAsync().then(b => { _broker = b; return b; });
  }
  return _brokerInitPromise;
}

/** Reset broker instance (for testing). */
export function _resetBroker(mock?: BrokerAdapter): void {
  _broker = mock ?? null;
}

// ─── Order Placement ──────────────────────────────────────────

/** Place a market order for mine entry/exit. */
export async function placeMarketOrder(
  symbol: string,
  side: 'long' | 'short',
  qty: number,
): Promise<OrderResult> {
  try {
    const broker = await getBroker();
    const brokerSide: Side = side === 'long' ? 'LONG' : 'SHORT';
    const order = await broker.placeOrder({
      symbol,
      side: brokerSide,
      type: 'market',
      quantity: qty,
    });
    return {
      success: true,
      orderId: order.id,
      filledPrice: order.filledPrice || null,
      filledQty: order.filledQty || null,
      status: order.status,
      error: null,
    };
  } catch (e: any) {
    return {
      success: false,
      orderId: null,
      filledPrice: null,
      filledQty: null,
      status: null,
      error: e?.message ?? String(e),
    };
  }
}

/** Place a limit order. */
export async function placeLimitOrder(
  symbol: string,
  side: 'long' | 'short',
  qty: number,
  limitPrice: number,
): Promise<OrderResult> {
  try {
    const broker = await getBroker();
    const brokerSide: Side = side === 'long' ? 'LONG' : 'SHORT';
    const order = await broker.placeOrder({
      symbol,
      side: brokerSide,
      type: 'limit',
      quantity: qty,
      price: limitPrice,
    });
    return {
      success: true,
      orderId: order.id,
      filledPrice: order.filledPrice || null,
      filledQty: order.filledQty || null,
      status: order.status,
      error: null,
    };
  } catch (e: any) {
    return {
      success: false,
      orderId: null,
      filledPrice: null,
      filledQty: null,
      status: null,
      error: e?.message ?? String(e),
    };
  }
}

// ─── Order Management ─────────────────────────────────────────

/** Cancel an open order. */
export async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    const broker = await getBroker();
    await broker.cancelOrder(orderId);
    return true;
  } catch {
    return false;
  }
}

/** Get order status. */
export async function getOrderStatus(orderId: string): Promise<BrokerOrder | null> {
  try {
    const broker = await getBroker();
    return await broker.getOrder(orderId);
  } catch {
    return null;
  }
}

// ─── Account Info ─────────────────────────────────────────────

/** Get account info (equity, buying power). */
export async function getAccountInfo(): Promise<AccountInfo | null> {
  try {
    const broker = await getBroker();
    const balance: BrokerBalance = await broker.getBalance();
    return {
      equity: balance.total,
      buyingPower: balance.available,
      cash: balance.total - balance.locked,
    };
  } catch {
    return null;
  }
}

// ─── Close Position (market exit) ─────────────────────────────

/** Close a mine position by placing an opposing market order. */
export async function closePosition(
  symbol: string,
  direction: 'long' | 'short',
  qty: number,
): Promise<OrderResult> {
  // To close a long, sell; to close a short, buy
  const exitSide = direction === 'long' ? 'short' : 'long';
  return placeMarketOrder(symbol, exitSide, qty);
}
