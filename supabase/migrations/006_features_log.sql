-- Migration 006: NexusOne Feature Logger (passive multi-dimensional dataset)
-- Purpose: Log all available features at each tick for offline analysis.
-- Future price columns are backfilled by the same logger on subsequent ticks.
-- This table is APPEND-ONLY for inserts; only future_price_* columns are updated.

-- ============================================================
-- Table
-- ============================================================
CREATE TABLE IF NOT EXISTS nexusone_features_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Anchor
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),   -- tick wall-clock
  asset         TEXT        NOT NULL,                  -- e.g. 'BTC/USD'
  price         NUMERIC     NOT NULL,                  -- spot at tick time

  -- Dimension 1: Technical (from feature-engine)
  rsi_14        NUMERIC,
  bb_upper      NUMERIC,
  bb_middle     NUMERIC,
  bb_lower      NUMERIC,
  bb_percent_b  NUMERIC,
  bb_width      NUMERIC,
  adx_14        NUMERIC,
  ema_20        NUMERIC,
  ema_50        NUMERIC,
  price_vs_ema50 NUMERIC,
  atr_14        NUMERIC,
  atr_ratio     NUMERIC,
  volume_ratio  NUMERIC,

  -- Dimension 2: Derivatives
  funding_rate          NUMERIC,   -- OKX current funding rate
  funding_rate_predicted NUMERIC,  -- OKX predicted next funding (if available)
  open_interest         NUMERIC,   -- OI in base currency (e.g. BTC)
  open_interest_change_pct NUMERIC, -- OI % change vs 1h ago (computed)

  -- Dimension 3: Sentiment
  fear_greed_index      INTEGER,   -- 0-100, from alternative.me
  fear_greed_class      TEXT,      -- 'Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'

  -- Dimension 4: Order Flow
  taker_buy_ratio       NUMERIC,   -- taker buy vol / total vol (0-1)

  -- Dimension 5: Context / Macro
  btc_dominance_pct     NUMERIC,   -- from CoinGecko global

  -- Regime (from existing v2 regime detector)
  regime                TEXT,      -- 'BULL', 'BEAR', 'RANGING', etc.

  -- Future prices (backfilled by subsequent ticks)
  future_price_1h       NUMERIC,   -- price 1h after this tick
  future_price_4h       NUMERIC,   -- price 4h after this tick
  future_price_24h      NUMERIC,   -- price 24h after this tick
  future_return_1h_pct  NUMERIC,   -- (future_price_1h - price) / price * 100
  future_return_4h_pct  NUMERIC,
  future_return_24h_pct NUMERIC,

  -- Meta
  data_quality          JSONB DEFAULT '{}'::jsonb,  -- which dimensions had errors
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- Primary query: recent rows per asset, ordered by time
CREATE INDEX idx_features_log_asset_ts
  ON nexusone_features_log (asset, ts DESC);

-- Backfill query: find rows needing future price updates
CREATE INDEX idx_features_log_backfill_1h
  ON nexusone_features_log (ts)
  WHERE future_price_1h IS NULL;

CREATE INDEX idx_features_log_backfill_4h
  ON nexusone_features_log (ts)
  WHERE future_price_4h IS NULL;

CREATE INDEX idx_features_log_backfill_24h
  ON nexusone_features_log (ts)
  WHERE future_price_24h IS NULL;

-- Analysis: filter by regime
CREATE INDEX idx_features_log_regime
  ON nexusone_features_log (regime, ts DESC);

-- ============================================================
-- RLS (same pattern as 005_nexusone_v2.sql)
-- ============================================================
ALTER TABLE nexusone_features_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by feature-logger)
CREATE POLICY "service_role_full_access"
  ON nexusone_features_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon/authenticated can read for dashboard
CREATE POLICY "authenticated_read"
  ON nexusone_features_log
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE nexusone_features_log IS
  'Passive multi-dimensional feature log. One row per tick per asset. Future prices backfilled by logger.';
COMMENT ON COLUMN nexusone_features_log.data_quality IS
  'JSON object tracking which data sources failed, e.g. {"fear_greed": "timeout", "coingecko": "rate_limit"}';
