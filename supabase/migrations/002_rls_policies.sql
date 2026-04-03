-- ═══════════════════════════════════════════════════════════════
-- NEXUS PRO — Row Level Security Policies
-- Migration 002: Complete RLS for all tables
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ── Profiles ──
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── Broker Connections (extra restrictive) ──
CREATE POLICY "broker_all_own" ON public.broker_connections
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Trading Configs ──
CREATE POLICY "configs_all_own" ON public.trading_configs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Backtest Results ──
CREATE POLICY "backtests_all_own" ON public.backtest_results
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Trades ──
CREATE POLICY "trades_all_own" ON public.trades
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Watchlists ──
CREATE POLICY "watchlists_all_own" ON public.watchlists
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Alerts ──
CREATE POLICY "alerts_all_own" ON public.alerts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Market Data (read-only for all authenticated) ──
CREATE POLICY "market_data_read_auth" ON public.market_data_cache
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "market_data_insert_service" ON public.market_data_cache
  FOR INSERT TO service_role WITH CHECK (true);

-- ── Signal Log ──
CREATE POLICY "signals_select_own" ON public.signal_log
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "signals_insert_own" ON public.signal_log
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ── Audit Log (insert-only, read own) ──
CREATE POLICY "audit_read_own" ON public.audit_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "audit_insert" ON public.audit_log
  FOR INSERT WITH CHECK (true);
