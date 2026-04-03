-- ═══════════════════════════════════════════════════════════════
-- NEXUS PRO — Indexes, Functions, Triggers
-- Migration 003
-- ═══════════════════════════════════════════════════════════════

-- ── Performance Indexes ─────────────────────────────────────
CREATE INDEX idx_backtests_user_date ON public.backtest_results(user_id, created_at DESC);
CREATE INDEX idx_backtests_symbol_strat ON public.backtest_results(symbol, strategy);
CREATE INDEX idx_backtests_metrics ON public.backtest_results(user_id, return_pct DESC, sharpe_ratio DESC);

CREATE INDEX idx_trades_user_date ON public.trades(user_id, created_at DESC);
CREATE INDEX idx_trades_symbol_status ON public.trades(symbol, status);
CREATE INDEX idx_trades_live ON public.trades(user_id, is_live, status) WHERE is_live = true;
CREATE INDEX idx_trades_open ON public.trades(user_id, status) WHERE status = 'open';

CREATE INDEX idx_alerts_active ON public.alerts(user_id, is_active, symbol) WHERE is_active = true;
CREATE INDEX idx_signals_recent ON public.signal_log(symbol, created_at DESC);
CREATE INDEX idx_market_data_lookup ON public.market_data_cache(symbol, timeframe, timestamp DESC);
CREATE INDEX idx_audit_user ON public.audit_log(user_id, created_at DESC);

-- Partial index for active broker connections
CREATE INDEX idx_broker_active ON public.broker_connections(user_id, broker) WHERE is_active = true;

-- ── Auto-timestamp trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
CREATE TRIGGER tr_configs_updated BEFORE UPDATE ON public.trading_configs
  FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
CREATE TRIGGER tr_trades_updated BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
CREATE TRIGGER tr_watchlists_updated BEFORE UPDATE ON public.watchlists
  FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();
CREATE TRIGGER tr_broker_updated BEFORE UPDATE ON public.broker_connections
  FOR EACH ROW EXECUTE FUNCTION public.trigger_updated_at();

-- ── Auto-create profile on signup ───────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Trader'),
    NEW.email
  );
  -- Default trading config
  INSERT INTO public.trading_configs (user_id, name) VALUES (NEW.id, 'Default');
  -- Default paper broker
  INSERT INTO public.broker_connections (user_id, broker, name, is_paper, is_active)
  VALUES (NEW.id, 'paper', 'Paper Trading', true, true);
  -- Default watchlist
  INSERT INTO public.watchlists (user_id, name, symbols, is_default)
  VALUES (NEW.id, 'Default', ARRAY['BTC/USD','ETH/USD','AAPL','NVDA','TSLA'], true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Audit logging function ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Audit live trades only (not backtest trades)
CREATE TRIGGER audit_trades_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW
  WHEN (COALESCE(NEW.is_live, OLD.is_live) = true)
  EXECUTE FUNCTION public.audit_change();

-- ── Portfolio summary view ──────────────────────────────────
CREATE OR REPLACE VIEW public.portfolio_summary AS
SELECT
  t.user_id,
  t.symbol,
  COUNT(*) FILTER (WHERE t.status = 'closed') as total_trades,
  COUNT(*) FILTER (WHERE t.status = 'open') as open_positions,
  COALESCE(SUM(t.net_pnl) FILTER (WHERE t.status = 'closed'), 0) as total_pnl,
  COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.net_pnl > 0), 0) as avg_win_pct,
  COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.net_pnl <= 0), 0) as avg_loss_pct,
  COUNT(*) FILTER (WHERE t.net_pnl > 0)::FLOAT /
    NULLIF(COUNT(*) FILTER (WHERE t.status = 'closed'), 0) * 100 as win_rate,
  MAX(t.created_at) as last_trade_at
FROM public.trades t
WHERE t.is_live = true
GROUP BY t.user_id, t.symbol;

-- ── Best backtest results view ──────────────────────────────
CREATE OR REPLACE VIEW public.best_backtests AS
SELECT DISTINCT ON (user_id, symbol, strategy)
  id, user_id, symbol, strategy, timeframe,
  return_pct, win_rate, sharpe_ratio, profit_factor,
  max_drawdown, total_trades, created_at
FROM public.backtest_results
ORDER BY user_id, symbol, strategy, sharpe_ratio DESC NULLS LAST;

-- ── Rate limiting table ─────────────────────────────────────
CREATE TABLE public.rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT, p_max INTEGER, p_window INTERVAL
) RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limits (key, count, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limits.window_start + p_window < now() THEN 1
      ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start + p_window < now() THEN now()
      ELSE rate_limits.window_start
    END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$ LANGUAGE plpgsql;
