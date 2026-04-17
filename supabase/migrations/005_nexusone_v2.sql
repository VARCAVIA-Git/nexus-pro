-- ═══════════════════════════════════════════════════════════════
-- NexusOne v2 — Dual-write cold storage tables
--
-- Primary path: Redis (hot). This schema is the durable mirror.
-- Every signal, order, trade and daily metric is written here in
-- parallel via DualWriter (Promise.allSettled).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nexusone_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id TEXT UNIQUE NOT NULL,
  strategy_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price NUMERIC NOT NULL,
  stop_loss NUMERIC NOT NULL,
  take_profit NUMERIC NOT NULL,
  rsi NUMERIC,
  regime TEXT,
  features JSONB,
  status TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexusone_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  signal_id TEXT REFERENCES nexusone_signals(signal_id),
  asset TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity NUMERIC NOT NULL,
  order_type TEXT NOT NULL,
  limit_price NUMERIC,
  status TEXT NOT NULL,
  filled_price NUMERIC,
  filled_qty NUMERIC,
  venue TEXT NOT NULL,
  latency_ms INTEGER,
  slippage_bps NUMERIC,
  rejection_reason TEXT,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexusone_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id TEXT UNIQUE NOT NULL,
  strategy_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_order_id TEXT REFERENCES nexusone_orders(order_id),
  exit_order_id TEXT REFERENCES nexusone_orders(order_id),
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  quantity NUMERIC NOT NULL,
  pnl NUMERIC,
  pnl_percent NUMERIC,
  fees NUMERIC NOT NULL DEFAULT 0,
  net_pnl NUMERIC,
  hold_duration_min INTEGER,
  exit_reason TEXT,
  regime_at_entry TEXT,
  regime_at_exit TEXT,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexusone_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  gross_pnl NUMERIC NOT NULL DEFAULT 0,
  total_fees NUMERIC NOT NULL DEFAULT 0,
  net_pnl NUMERIC NOT NULL DEFAULT 0,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 0,
  equity_start NUMERIC NOT NULL,
  equity_end NUMERIC,
  regime_distribution JSONB,
  strategies_active JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexusone_signals_created   ON nexusone_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexusone_signals_signal    ON nexusone_signals(signal_id);
CREATE INDEX IF NOT EXISTS idx_nexusone_orders_signal     ON nexusone_orders(signal_id);
CREATE INDEX IF NOT EXISTS idx_nexusone_orders_created    ON nexusone_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexusone_trades_strategy   ON nexusone_trades(strategy_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexusone_trades_closed     ON nexusone_trades(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexusone_daily_date        ON nexusone_daily_metrics(date DESC);

-- Service role writes; anon reads closed metrics only.
ALTER TABLE nexusone_signals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexusone_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexusone_trades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexusone_daily_metrics  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nexusone_signals_service    ON nexusone_signals;
DROP POLICY IF EXISTS nexusone_orders_service     ON nexusone_orders;
DROP POLICY IF EXISTS nexusone_trades_service     ON nexusone_trades;
DROP POLICY IF EXISTS nexusone_daily_service      ON nexusone_daily_metrics;

CREATE POLICY nexusone_signals_service   ON nexusone_signals       FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY nexusone_orders_service    ON nexusone_orders        FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY nexusone_trades_service    ON nexusone_trades        FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY nexusone_daily_service     ON nexusone_daily_metrics FOR ALL USING (auth.role() = 'service_role');
