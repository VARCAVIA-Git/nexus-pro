// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Dual Writer (Redis hot + Supabase cold)
//
// Every signal, order, trade and daily metric is mirrored to BOTH
// stores in parallel via Promise.allSettled. If one fails we log
// an alert but never block the trading pipeline.
//
// Writing contract:
//   - Redis is append-only lists (capped) for quick reads.
//   - Supabase is the durable source-of-truth for analytics.
//   - Keys/tables live-side-by-side under the `nexusone_` prefix.
// ═══════════════════════════════════════════════════════════════

import { redisLpush, redisSet } from '@/lib/db/redis';
import { getServiceSupabase } from './supabase-client';

const LOG_MAX_ENTRIES = 500;
const LOG_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days in Redis

const KEY_SIGNAL_LOG = 'nexusone:v2:signals';
const KEY_ORDER_LOG = 'nexusone:v2:orders';
const KEY_TRADE_LOG = 'nexusone:v2:trades';
const KEY_DAILY_LOG = 'nexusone:v2:daily_metrics';

export interface SignalRecord {
  signal_id: string;
  strategy_id: string;
  asset: string;
  direction: 'long' | 'short';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  rsi: number | null;
  regime: string | null;
  features: Record<string, unknown>;
  status?: string | null;
  reason?: string | null;
  created_at?: string;
}

export interface OrderRecord {
  order_id: string;
  signal_id: string | null;
  asset: string;
  side: 'buy' | 'sell';
  quantity: number;
  order_type: string;
  limit_price: number | null;
  status: string;
  filled_price: number | null;
  filled_qty: number | null;
  venue: string;
  latency_ms: number | null;
  slippage_bps: number | null;
  rejection_reason: string | null;
  is_simulated: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TradeRecord {
  trade_id: string;
  strategy_id: string;
  asset: string;
  direction: 'long' | 'short';
  entry_order_id: string | null;
  exit_order_id: string | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  pnl_percent: number | null;
  fees: number;
  net_pnl: number | null;
  hold_duration_min: number | null;
  exit_reason: string | null;
  regime_at_entry: string | null;
  regime_at_exit: string | null;
  is_simulated: boolean;
  opened_at: string;
  closed_at: string | null;
}

export interface DailyMetricRecord {
  date: string; // YYYY-MM-DD
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  gross_pnl: number;
  total_fees: number;
  net_pnl: number;
  max_drawdown_pct: number;
  equity_start: number;
  equity_end: number | null;
  regime_distribution: Record<string, number> | null;
  strategies_active: Record<string, number> | null;
}

async function logWriteFailure(target: 'redis' | 'supabase', kind: string, id: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[nexusone/dualwriter] ${target} write failed (${kind} ${id}): ${msg}`);
}

async function dualInsert<T extends { [k: string]: any }>(
  redisKey: string,
  table: string,
  idField: string,
  record: T,
): Promise<void> {
  const id = record[idField];
  const supabase = getServiceSupabase();

  const jobs: Promise<unknown>[] = [redisLpush(redisKey, record, LOG_MAX_ENTRIES)];
  if (supabase) {
    jobs.push(Promise.resolve(supabase.from(table).insert(record).throwOnError()));
  }

  const results = await Promise.allSettled(jobs);
  if (results[0].status === 'rejected') {
    await logWriteFailure('redis', table, id, results[0].reason);
  }
  if (supabase && results[1] && results[1].status === 'rejected') {
    await logWriteFailure('supabase', table, id, results[1].reason);
  }
}

async function dualUpsert<T extends { [k: string]: any }>(
  redisKey: string,
  table: string,
  idField: string,
  record: T,
): Promise<void> {
  const id = record[idField];
  const supabase = getServiceSupabase();

  const jobs: Promise<unknown>[] = [
    redisSet(`${redisKey}:${id}`, record, LOG_TTL_SECONDS),
  ];
  if (supabase) {
    jobs.push(Promise.resolve(supabase.from(table).upsert(record, { onConflict: idField }).throwOnError()));
  }

  const results = await Promise.allSettled(jobs);
  if (results[0].status === 'rejected') {
    await logWriteFailure('redis', table, id, results[0].reason);
  }
  if (supabase && results[1] && results[1].status === 'rejected') {
    await logWriteFailure('supabase', table, id, results[1].reason);
  }
}

export const dualWriter = {
  async writeSignal(signal: SignalRecord): Promise<void> {
    await dualInsert(KEY_SIGNAL_LOG, 'nexusone_signals', 'signal_id', {
      ...signal,
      created_at: signal.created_at ?? new Date().toISOString(),
    });
  },

  async writeOrder(order: OrderRecord): Promise<void> {
    const now = new Date().toISOString();
    const record = {
      ...order,
      created_at: order.created_at ?? now,
      updated_at: order.updated_at ?? now,
    };
    await dualUpsert(KEY_ORDER_LOG, 'nexusone_orders', 'order_id', record);
    await redisLpush(`${KEY_ORDER_LOG}:history`, record, LOG_MAX_ENTRIES);
  },

  async writeTrade(trade: TradeRecord): Promise<void> {
    await dualUpsert(KEY_TRADE_LOG, 'nexusone_trades', 'trade_id', trade);
    await redisLpush(`${KEY_TRADE_LOG}:history`, trade, LOG_MAX_ENTRIES);
  },

  async writeDailyMetrics(metric: DailyMetricRecord): Promise<void> {
    await dualUpsert(KEY_DAILY_LOG, 'nexusone_daily_metrics', 'date', metric);
  },
};
