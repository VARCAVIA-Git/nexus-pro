-- ═══════════════════════════════════════════════════════════════
-- NexusOne — server-side anon writes
--
-- The droplet runs Next.js server-side with the Supabase anon key
-- in .env.local (never shipped to a public surface). These policies
-- let `anon` INSERT + UPDATE (and SELECT) NexusOne tables so the
-- DualWriter and feature logger can persist without service_role.
-- ═══════════════════════════════════════════════════════════════

-- nexusone_signals
DROP POLICY IF EXISTS nexusone_signals_anon_write ON nexusone_signals;
CREATE POLICY nexusone_signals_anon_write ON nexusone_signals
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_signals_anon_update ON nexusone_signals;
CREATE POLICY nexusone_signals_anon_update ON nexusone_signals
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_signals_anon_read ON nexusone_signals;
CREATE POLICY nexusone_signals_anon_read ON nexusone_signals
  FOR SELECT TO anon USING (true);

-- nexusone_orders
DROP POLICY IF EXISTS nexusone_orders_anon_write ON nexusone_orders;
CREATE POLICY nexusone_orders_anon_write ON nexusone_orders
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_orders_anon_update ON nexusone_orders;
CREATE POLICY nexusone_orders_anon_update ON nexusone_orders
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_orders_anon_read ON nexusone_orders;
CREATE POLICY nexusone_orders_anon_read ON nexusone_orders
  FOR SELECT TO anon USING (true);

-- nexusone_trades
DROP POLICY IF EXISTS nexusone_trades_anon_write ON nexusone_trades;
CREATE POLICY nexusone_trades_anon_write ON nexusone_trades
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_trades_anon_update ON nexusone_trades;
CREATE POLICY nexusone_trades_anon_update ON nexusone_trades
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_trades_anon_read ON nexusone_trades;
CREATE POLICY nexusone_trades_anon_read ON nexusone_trades
  FOR SELECT TO anon USING (true);

-- nexusone_daily_metrics
DROP POLICY IF EXISTS nexusone_daily_anon_write ON nexusone_daily_metrics;
CREATE POLICY nexusone_daily_anon_write ON nexusone_daily_metrics
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_daily_anon_update ON nexusone_daily_metrics;
CREATE POLICY nexusone_daily_anon_update ON nexusone_daily_metrics
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_daily_anon_read ON nexusone_daily_metrics;
CREATE POLICY nexusone_daily_anon_read ON nexusone_daily_metrics
  FOR SELECT TO anon USING (true);

-- nexusone_features_log
DROP POLICY IF EXISTS nexusone_features_anon_write ON nexusone_features_log;
CREATE POLICY nexusone_features_anon_write ON nexusone_features_log
  FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_features_anon_update ON nexusone_features_log;
CREATE POLICY nexusone_features_anon_update ON nexusone_features_log
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS nexusone_features_anon_read ON nexusone_features_log;
CREATE POLICY nexusone_features_anon_read ON nexusone_features_log
  FOR SELECT TO anon USING (true);
