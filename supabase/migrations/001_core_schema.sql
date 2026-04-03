-- ═══════════════════════════════════════════════════════════════
-- NEXUS PRO — Core Database Schema
-- Migration 001: Users, Configs, Core Tables
-- ═══════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── ENUM Types ──────────────────────────────────────────────
CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE trade_side AS ENUM ('LONG', 'SHORT');
CREATE TYPE trade_status AS ENUM ('open', 'closed', 'cancelled', 'pending');
CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE alert_condition AS ENUM (
  'price_above', 'price_below', 'rsi_above', 'rsi_below',
  'macd_cross_up', 'macd_cross_down', 'pattern_detected', 'strategy_signal'
);
CREATE TYPE broker_type AS ENUM ('paper', 'binance', 'alpaca', 'ibkr');
CREATE TYPE timeframe AS ENUM ('1m', '5m', '15m', '1h', '4h', '1d', '1w');

-- ── Profiles ────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Trader',
  email TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  locale TEXT NOT NULL DEFAULT 'it',
  subscription subscription_tier NOT NULL DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{
    "theme": "dark",
    "notifications": true,
    "emailAlerts": true,
    "telegramAlerts": false,
    "defaultTimeframe": "1d",
    "defaultCapital": 10000,
    "riskTolerance": "moderate"
  }'::jsonb,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Broker Connections ──────────────────────────────────────
CREATE TABLE public.broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker broker_type NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  -- Encrypted credentials stored as JSONB
  credentials_encrypted BYTEA,
  is_paper BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  balance DECIMAL(18,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, broker, name)
);

-- ── Trading Configurations ──────────────────────────────────
CREATE TABLE public.trading_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{
    "capital": 10000,
    "riskPerTrade": 5,
    "maxPositions": 3,
    "stopLossPct": 3,
    "takeProfitPct": 6.5,
    "trailingStop": true,
    "trailingPct": 2.5,
    "commissionPct": 0.1,
    "slippagePct": 0.05,
    "cooldownBars": 3,
    "kellyFraction": 0.5,
    "maxDrawdownLimit": 25,
    "dailyLossLimit": 5
  }'::jsonb,
  strategy TEXT NOT NULL DEFAULT 'combined_ai',
  symbols TEXT[] NOT NULL DEFAULT ARRAY['BTC/USD', 'ETH/USD'],
  timeframes timeframe[] NOT NULL DEFAULT ARRAY['1d'::timeframe],
  broker_id UUID REFERENCES public.broker_connections(id),
  is_live BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Backtest Results ────────────────────────────────────────
CREATE TABLE public.backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.trading_configs(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  timeframe timeframe NOT NULL DEFAULT '1d',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Denormalized metrics for fast queries
  return_pct DECIMAL(10,2) NOT NULL DEFAULT 0,
  win_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  profit_factor DECIMAL(8,2) DEFAULT 0,
  sharpe_ratio DECIMAL(6,2) DEFAULT 0,
  sortino_ratio DECIMAL(6,2) DEFAULT 0,
  calmar_ratio DECIMAL(6,2) DEFAULT 0,
  max_drawdown DECIMAL(6,2) DEFAULT 0,
  expectancy DECIMAL(12,2) DEFAULT 0,
  avg_win DECIMAL(12,2) DEFAULT 0,
  avg_loss DECIMAL(12,2) DEFAULT 0,
  max_consec_wins INTEGER DEFAULT 0,
  max_consec_losses INTEGER DEFAULT 0,
  initial_capital DECIMAL(18,2) NOT NULL,
  final_capital DECIMAL(18,2) NOT NULL,
  total_commission DECIMAL(12,2) DEFAULT 0,
  -- Full results as JSON (equity curve, trades array, etc.)
  full_results JSONB,
  -- Monte Carlo results
  monte_carlo JSONB,
  -- Walk-Forward results
  walk_forward JSONB,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Trades ──────────────────────────────────────────────────
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  backtest_id UUID REFERENCES public.backtest_results(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES public.broker_connections(id),
  -- Trade identification
  external_id TEXT,  -- Broker order ID
  symbol TEXT NOT NULL,
  side trade_side NOT NULL,
  status trade_status NOT NULL DEFAULT 'open',
  order_type order_type NOT NULL DEFAULT 'market',
  -- Prices
  entry_price DECIMAL(18,8) NOT NULL,
  exit_price DECIMAL(18,8),
  stop_loss DECIMAL(18,8),
  take_profit DECIMAL(18,8),
  -- Sizing
  quantity DECIMAL(18,8) NOT NULL,
  size_usd DECIMAL(18,2) NOT NULL,
  leverage DECIMAL(6,2) DEFAULT 1,
  -- P&L
  gross_pnl DECIMAL(18,2),
  commission DECIMAL(12,2) DEFAULT 0,
  net_pnl DECIMAL(18,2),
  pnl_pct DECIMAL(8,2),
  -- Timing
  entry_at TIMESTAMPTZ NOT NULL,
  exit_at TIMESTAMPTZ,
  duration_bars INTEGER,
  -- Context
  strategy TEXT,
  signal_confidence DECIMAL(4,2),
  regime TEXT,
  exit_reason TEXT,
  is_live BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Watchlists ──────────────────────────────────────────────
CREATE TABLE public.watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  symbols TEXT[] NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Alerts ──────────────────────────────────────────────────
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  condition alert_condition NOT NULL,
  condition_value DECIMAL(18,8),
  condition_params JSONB DEFAULT '{}'::jsonb,
  message TEXT,
  -- Delivery
  notify_push BOOLEAN NOT NULL DEFAULT true,
  notify_email BOOLEAN NOT NULL DEFAULT false,
  notify_telegram BOOLEAN NOT NULL DEFAULT false,
  -- State
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  triggered_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Market Data Cache ───────────────────────────────────────
CREATE TABLE public.market_data_cache (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe timeframe NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  open DECIMAL(18,8) NOT NULL,
  high DECIMAL(18,8) NOT NULL,
  low DECIMAL(18,8) NOT NULL,
  close DECIMAL(18,8) NOT NULL,
  volume DECIMAL(24,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe, timestamp)
);

-- ── Signal Log ──────────────────────────────────────────────
CREATE TABLE public.signal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN ('BUY', 'SELL', 'NEUTRAL')),
  confidence DECIMAL(4,2) NOT NULL,
  indicators JSONB NOT NULL DEFAULT '{}'::jsonb,
  patterns JSONB DEFAULT '[]'::jsonb,
  regime TEXT,
  price_at_signal DECIMAL(18,8) NOT NULL,
  was_executed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit Log ───────────────────────────────────────────────
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
