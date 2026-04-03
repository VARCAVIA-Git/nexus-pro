-- ═══════════════════════════════════════════════════════════════
-- NEXUS PRO — Scheduled Jobs (pg_cron)
-- Migration 004
-- ═══════════════════════════════════════════════════════════════

-- Cleanup old market data (keep 1 year)
-- SELECT cron.schedule('cleanup-market-data', '0 3 * * 0',
--   $$DELETE FROM public.market_data_cache WHERE timestamp < now() - interval '365 days'$$
-- );

-- Cleanup expired alerts
-- SELECT cron.schedule('cleanup-alerts', '0 4 * * *',
--   $$UPDATE public.alerts SET is_active = false WHERE expires_at < now() AND is_active = true$$
-- );

-- Cleanup old audit logs (keep 90 days)
-- SELECT cron.schedule('cleanup-audit', '0 5 * * 0',
--   $$DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days'$$
-- );

-- Reset rate limits
-- SELECT cron.schedule('reset-rate-limits', '*/5 * * * *',
--   $$DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour'$$
-- );
