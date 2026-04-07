#!/usr/bin/env bash
###############################################################################
#  NEXUS PRO — FIX & COMPLETA (per WSL 2)
#
#  Riprende da FASE 3 dove lo script si è fermato.
#  Gestisce WSL 2 + Docker Desktop correttamente.
#
#  USO:  chmod +x nexus-fix.sh && ./nexus-fix.sh
###############################################################################

set -euo pipefail

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m'
C='\033[0;36m' W='\033[1;37m' D='\033[0;90m' NC='\033[0m'

banner() { echo -e "\n${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${W}  $1${NC}\n${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
step()   { echo -e "  ${G}✓ $1${NC}"; }
info()   { echo -e "  ${D}→ $1${NC}"; }
warn()   { echo -e "  ${Y}⚠ $1${NC}"; }

NEXUS="$HOME/nexus-pro"
cd "$NEXUS"

banner "NEXUS PRO — FIX PER WSL 2"

###############################################################################
# 1. SUPABASE CLI (via npm — il metodo curl ha URL rotti)
###############################################################################
banner "FIX 1 · SUPABASE CLI"

if ! command -v supabase &>/dev/null; then
  info "Installazione Supabase CLI via npm..."
  npm install -g supabase
  step "Supabase CLI installato: $(supabase --version 2>/dev/null || echo 'ok')"
else
  step "Supabase CLI già presente: $(supabase --version 2>/dev/null || echo 'ok')"
fi

###############################################################################
# 2. DOCKER — Verifica WSL integration
###############################################################################
banner "FIX 2 · DOCKER SU WSL 2"

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  step "Docker funzionante via Docker Desktop"
else
  warn "Docker NON disponibile in WSL."
  echo ""
  echo -e "  ${W}Per attivarlo:${NC}"
  echo -e "  ${C}1.${NC} Apri Docker Desktop su Windows"
  echo -e "  ${C}2.${NC} Settings → Resources → WSL Integration"
  echo -e "  ${C}3.${NC} Attiva per la tua distro Ubuntu"
  echo -e "  ${C}4.${NC} Clicca 'Apply & Restart'"
  echo -e "  ${C}5.${NC} Riapri questo terminale WSL"
  echo ""
  info "Lo script continua senza Docker — potrai attivarlo dopo"
fi

###############################################################################
# 3. COMPLETA LE FASI MANCANTI (4-12)
###############################################################################
banner "FIX 3 · STRUTTURA PROGETTO"

DIRS=(
  "src/app/(auth)/login" "src/app/(auth)/register"
  "src/app/(dashboard)/dashboard" "src/app/(dashboard)/analysis"
  "src/app/(dashboard)/backtest" "src/app/(dashboard)/trades"
  "src/app/(dashboard)/portfolio" "src/app/(dashboard)/settings"
  "src/app/api/health" "src/app/api/signals" "src/app/api/trades"
  "src/app/api/backtest" "src/app/api/market-data"
  "src/app/api/webhooks/broker" "src/app/api/cron/cleanup" "src/app/api/cron/signals"
  "src/components/ui" "src/components/charts" "src/components/dashboard"
  "src/components/trading" "src/components/layout"
  "src/lib/engine/indicators" "src/lib/engine/patterns" "src/lib/engine/strategies"
  "src/lib/engine/backtest" "src/lib/engine/risk" "src/lib/engine/signals"
  "src/lib/broker/binance" "src/lib/broker/alpaca" "src/lib/broker/paper"
  "src/lib/data/providers" "src/lib/data/cache" "src/lib/data/streams"
  "src/lib/auth" "src/lib/db" "src/lib/store" "src/lib/utils"
  "src/lib/crypto" "src/lib/logger" "src/lib/validation"
  "src/workers/signal-scanner" "src/workers/data-fetcher"
  "src/workers/alert-dispatcher" "src/workers/portfolio-sync"
  "src/hooks" "src/types"
  "supabase/migrations" "supabase/functions/process-signal"
  "supabase/functions/send-alert" "supabase/seed"
  "agents/trading-analyst" "agents/risk-manager"
  "agents/market-scanner" "agents/report-generator" "agents/config"
  "docker/nginx" "docker/workers"
  "tests/unit/engine" "tests/unit/strategies"
  "tests/integration/broker" "tests/integration/api" "tests/e2e"
  ".github/workflows" "scripts"
  "docs/adr" "docs/api" "docs/guides" "public/icons"
)

for dir in "${DIRS[@]}"; do mkdir -p "$dir"; done
step "Struttura directory verificata (${#DIRS[@]} cartelle)"

###############################################################################
# 4. PACKAGE.JSON & CONFIGS
###############################################################################
banner "FIX 4 · CONFIGURAZIONI"

if [ ! -f "package.json" ]; then
cat > package.json << 'EOF'
{
  "name": "nexus-pro",
  "version": "5.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "lint": "next lint && tsc --noEmit",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "db:migrate": "supabase db push",
    "db:reset": "supabase db reset",
    "db:types": "supabase gen types typescript --local > src/types/database.ts",
    "docker:dev": "docker compose -f docker/docker-compose.dev.yml up -d",
    "docker:down": "docker compose -f docker/docker-compose.dev.yml down",
    "workers:start": "tsx src/workers/index.ts",
    "agents:start": "node agents/config/runner.js"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "zustand": "^4.5.0",
    "zod": "^3.23.0",
    "@tanstack/react-query": "^5.50.0",
    "lightweight-charts": "^4.2.0",
    "recharts": "^2.12.0",
    "d3": "^7.9.0",
    "technicalindicators": "^3.1.0",
    "decimal.js": "^10.4.0",
    "date-fns": "^3.6.0",
    "nanoid": "^5.0.0",
    "pino": "^9.2.0",
    "pino-pretty": "^11.2.0",
    "bullmq": "^5.8.0",
    "ioredis": "^5.4.0",
    "ws": "^8.17.0",
    "lucide-react": "^0.400.0",
    "tailwind-merge": "^2.4.0",
    "clsx": "^2.1.0",
    "class-variance-authority": "^0.7.0",
    "framer-motion": "^11.3.0",
    "sonner": "^1.5.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-tooltip": "^1.1.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/d3": "^7.4.0",
    "@types/ws": "^8.5.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "tsx": "^4.16.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "prettier": "^3.3.0"
  }
}
EOF
step "package.json creato"
else
  step "package.json già presente"
fi

if [ ! -f "tsconfig.json" ]; then
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true, "skipLibCheck": true, "strict": true, "noEmit": true,
    "esModuleInterop": true, "module": "esnext", "moduleResolution": "bundler",
    "resolveJsonModule": true, "isolatedModules": true, "jsx": "preserve",
    "incremental": true, "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF
step "tsconfig.json creato"
else step "tsconfig.json già presente"; fi

if [ ! -f "next.config.mjs" ]; then
cat > next.config.mjs << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  headers: async () => [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
    ],
  }],
};
export default nextConfig;
EOF
step "next.config.mjs creato"
else step "next.config.mjs già presente"; fi

if [ ! -f "tailwind.config.ts" ]; then
cat > tailwind.config.ts << 'EOF'
import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class", content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { nexus: { bg:"#0a0e17", surface:"#111827", border:"#1e293b", accent:"#06b6d4", profit:"#22c55e", loss:"#ef4444", warning:"#f59e0b", neutral:"#94a3b8", text:"#f1f5f9", muted:"#64748b" } },
    fontFamily: { sans:["JetBrains Mono","monospace"], display:["Space Grotesk","sans-serif"] },
  }}, plugins: [],
};
export default config;
EOF
step "tailwind.config.ts creato"
fi

[ ! -f "postcss.config.js" ] && echo 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };' > postcss.config.js && step "postcss.config.js"
[ ! -f ".prettierrc" ] && echo '{ "semi": true, "singleQuote": true, "tabWidth": 2, "trailingComma": "es5" }' > .prettierrc && step ".prettierrc"
[ ! -f ".eslintrc.json" ] && echo '{"extends":["next/core-web-vitals","next/typescript"]}' > .eslintrc.json && step ".eslintrc.json"

if [ ! -f "vitest.config.ts" ]; then
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
EOF
step "vitest.config.ts"
fi

if [ ! -f ".env.local" ]; then
cat > .env.local << 'EOF'
# ── Supabase (compila dopo aver creato il progetto) ──
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# ── App ──
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
# ── Market Data ──
POLYGON_API_KEY=
COINGECKO_API_KEY=
# ── Broker (Paper Trading!) ──
BINANCE_API_KEY=
BINANCE_SECRET_KEY=
BINANCE_TESTNET=true
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPACA_PAPER=true
# ── Redis ──
REDIS_URL=redis://localhost:6379
# ── OpenClaw ──
OPENCLAW_ENDPOINT=http://localhost:8800
OPENCLAW_ENABLED=true
EOF
step ".env.local creato"
fi

if [ ! -f ".gitignore" ]; then
cat > .gitignore << 'EOF'
node_modules/
.next/
.env
.env.local
.env.*.local
.DS_Store
*.log
coverage/
dist/
docker/data/
supabase/.temp/
EOF
step ".gitignore"
fi

###############################################################################
# 5. DATABASE MIGRATIONS
###############################################################################
banner "FIX 5 · DATABASE MIGRATIONS"

[ ! -f "supabase/config.toml" ] && cat > supabase/config.toml << 'EOF'
[project]
id = "nexus-pro"
[api]
port = 54321
schemas = ["public"]
max_rows = 1000
[db]
port = 54322
major_version = 15
[studio]
port = 54323
EOF

if [ ! -f "supabase/migrations/001_types.sql" ]; then
cat > supabase/migrations/001_types.sql << 'EOF'
CREATE TYPE trade_side AS ENUM ('buy', 'sell');
CREATE TYPE trade_status AS ENUM ('open', 'closed', 'cancelled');
CREATE TYPE close_reason AS ENUM ('stop_loss','take_profit','trailing_stop','signal','manual','timeout','margin_call');
CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE timeframe AS ENUM ('1m','5m','15m','1h','4h','1d','1w');
CREATE TYPE signal_strength AS ENUM ('strong_buy','buy','neutral','sell','strong_sell');
CREATE TYPE alert_channel AS ENUM ('push', 'email', 'telegram', 'sms');
CREATE TYPE alert_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE broker_name AS ENUM ('paper', 'binance', 'alpaca', 'interactive_brokers');
CREATE TYPE market_regime AS ENUM ('bull', 'bear', 'high_vol', 'low_vol', 'sideways');
EOF
step "Migration 001 (types)"
fi

if [ ! -f "supabase/migrations/002_tables.sql" ]; then
cat > supabase/migrations/002_tables.sql << 'EOF'
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL, display_name TEXT, avatar_url TEXT,
  preferred_currency TEXT DEFAULT 'USD', timezone TEXT DEFAULT 'Europe/Rome',
  risk_tolerance SMALLINT DEFAULT 5 CHECK (risk_tolerance BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker broker_name NOT NULL, api_key_encrypted TEXT, secret_key_encrypted TEXT,
  is_paper BOOLEAN DEFAULT true, is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, broker)
);
CREATE TABLE trading_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Default', initial_capital NUMERIC(18,2) DEFAULT 10000,
  risk_per_trade NUMERIC(5,4) DEFAULT 0.02, max_open_trades SMALLINT DEFAULT 5,
  default_stop_loss NUMERIC(5,4) DEFAULT 0.03, default_take_profit NUMERIC(5,4) DEFAULT 0.06,
  use_trailing_stop BOOLEAN DEFAULT true, trailing_stop_pct NUMERIC(5,4) DEFAULT 0.02,
  use_kelly BOOLEAN DEFAULT true, kelly_fraction NUMERIC(3,2) DEFAULT 0.25,
  commission_pct NUMERIC(6,5) DEFAULT 0.001, slippage_pct NUMERIC(6,5) DEFAULT 0.0005,
  cooldown_minutes INTEGER DEFAULT 60, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  config_id UUID REFERENCES trading_configs(id),
  asset TEXT NOT NULL, strategy TEXT NOT NULL, timeframe timeframe DEFAULT '1d',
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  initial_capital NUMERIC(18,2), final_capital NUMERIC(18,2),
  total_return NUMERIC(8,4), sharpe_ratio NUMERIC(6,3), sortino_ratio NUMERIC(6,3),
  max_drawdown NUMERIC(6,4), win_rate NUMERIC(5,4), profit_factor NUMERIC(6,3),
  total_trades INTEGER, monte_carlo_prob NUMERIC(5,4), walk_forward_score NUMERIC(5,4),
  regime_detected market_regime, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  backtest_id UUID REFERENCES backtest_results(id) ON DELETE CASCADE,
  broker_connection_id UUID REFERENCES broker_connections(id),
  asset TEXT NOT NULL, side trade_side NOT NULL,
  status trade_status DEFAULT 'open', order_type order_type DEFAULT 'market',
  entry_price NUMERIC(18,8) NOT NULL, exit_price NUMERIC(18,8),
  quantity NUMERIC(18,8) NOT NULL, stop_loss NUMERIC(18,8), take_profit NUMERIC(18,8),
  trailing_stop_pct NUMERIC(5,4), commission NUMERIC(18,8) DEFAULT 0,
  slippage NUMERIC(18,8) DEFAULT 0, pnl NUMERIC(18,8), pnl_pct NUMERIC(8,4),
  close_reason close_reason, signal_data JSONB DEFAULT '{}', is_paper BOOLEAN DEFAULT true,
  opened_at TIMESTAMPTZ DEFAULT now(), closed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Main', assets TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, name)
);
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset TEXT NOT NULL, condition_type TEXT NOT NULL, condition_value JSONB NOT NULL,
  channel alert_channel DEFAULT 'push', status alert_status DEFAULT 'pending',
  message TEXT, triggered_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE market_data_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL, timeframe timeframe NOT NULL, data_date DATE NOT NULL,
  ohlcv JSONB NOT NULL, source TEXT NOT NULL, fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset, timeframe, data_date)
);
CREATE TABLE signal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id), asset TEXT NOT NULL, strategy TEXT NOT NULL,
  timeframe timeframe DEFAULT '1d', signal signal_strength NOT NULL,
  confidence NUMERIC(5,4), indicators JSONB NOT NULL, regime market_regime,
  acted_on BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id), action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id UUID, old_data JSONB, new_data JSONB,
  ip_address INET, user_agent TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
EOF
step "Migration 002 (10 tables)"
fi

if [ ! -f "supabase/migrations/003_security.sql" ]; then
cat > supabase/migrations/003_security.sql << 'EOF'
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "own" ON broker_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON trading_configs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON backtest_results FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON watchlists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON alerts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON signal_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own" ON audit_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "cache_read" ON market_data_cache FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX idx_trades_user ON trades(user_id, asset);
CREATE INDEX idx_trades_open ON trades(status) WHERE status = 'open';
CREATE INDEX idx_backtest_user ON backtest_results(user_id, created_at DESC);
CREATE INDEX idx_signals_user ON signal_log(user_id, asset, created_at DESC);
CREATE INDEX idx_alerts_pending ON alerts(user_id) WHERE status = 'pending';
CREATE INDEX idx_cache_lookup ON market_data_cache(asset, timeframe, data_date DESC);
EOF
step "Migration 003 (RLS + indexes)"
fi

if [ ! -f "supabase/migrations/004_functions.sql" ]; then
cat > supabase/migrations/004_functions.sql << 'EOF'
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_ts BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER tr_configs_ts BEFORE UPDATE ON trading_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_new_user AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION audit_live_trade() RETURNS TRIGGER AS $$
BEGIN
  IF NOT NEW.is_paper THEN
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
    VALUES (NEW.user_id,
      CASE WHEN TG_OP = 'INSERT' THEN 'trade_opened' WHEN NEW.status = 'closed' THEN 'trade_closed' ELSE 'trade_updated' END,
      'trade', NEW.id, row_to_json(NEW)::jsonb);
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_audit AFTER INSERT OR UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION audit_live_trade();

CREATE OR REPLACE VIEW portfolio_summary AS
SELECT user_id, asset,
  COUNT(*) FILTER (WHERE status='open') AS open_trades,
  COUNT(*) FILTER (WHERE status='closed') AS closed_trades,
  SUM(pnl) FILTER (WHERE status='closed') AS total_pnl,
  COUNT(*) FILTER (WHERE pnl>0 AND status='closed') AS wins,
  COUNT(*) FILTER (WHERE pnl<=0 AND status='closed') AS losses
FROM trades GROUP BY user_id, asset;
EOF
step "Migration 004 (functions + triggers)"
fi

###############################################################################
# 6. SOURCE FILES
###############################################################################
banner "FIX 6 · SOURCE FILES"

[ ! -f "src/lib/db/supabase.ts" ] && cat > src/lib/db/supabase.ts << 'EOF'
import { createBrowserClient } from '@supabase/ssr';
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
EOF

[ ! -f "src/lib/db/server.ts" ] && cat > src/lib/db/server.ts << 'EOF'
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function createServerSupabase() {
  const c = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => c.getAll(), setAll: (cs) => { cs.forEach(({name,value,options}) => c.set(name,value,options)); } } });
}
EOF

[ ! -f "src/lib/store/index.ts" ] && cat > src/lib/store/index.ts << 'EOF'
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
interface S { selectedAsset:string; selectedStrategy:string; selectedTimeframe:string; sidebarOpen:boolean; setAsset:(a:string)=>void; setStrategy:(s:string)=>void; setTimeframe:(t:string)=>void; toggleSidebar:()=>void; }
export const useNexusStore = create<S>()(persist((set) => ({
  selectedAsset:'BTC', selectedStrategy:'adaptive_momentum', selectedTimeframe:'1d', sidebarOpen:true,
  setAsset:(a)=>set({selectedAsset:a}), setStrategy:(s)=>set({selectedStrategy:s}),
  setTimeframe:(t)=>set({selectedTimeframe:t}), toggleSidebar:()=>set((s)=>({sidebarOpen:!s.sidebarOpen})),
}), { name: 'nexus-store' }));
EOF

[ ! -f "src/lib/logger/index.ts" ] && cat > src/lib/logger/index.ts << 'EOF'
import pino from 'pino';
export const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty', options: { colorize: true } } : undefined });
EOF

[ ! -f "src/types/trading.ts" ] && cat > src/types/trading.ts << 'EOF'
export interface OHLCV { timestamp:number; open:number; high:number; low:number; close:number; volume:number; }
export interface Signal { asset:string; strategy:string; strength:'strong_buy'|'buy'|'neutral'|'sell'|'strong_sell'; confidence:number; indicators:Record<string,number|string>; regime:string; timestamp:number; }
export interface Trade { id:string; asset:string; side:'buy'|'sell'; entryPrice:number; exitPrice?:number; quantity:number; stopLoss:number; takeProfit:number; pnl?:number; pnlPct?:number; closeReason?:string; isPaper:boolean; openedAt:Date; closedAt?:Date; }
export interface BacktestConfig { asset:string; strategy:string; timeframe:string; initialCapital:number; riskPerTrade:number; stopLossPct:number; takeProfitPct:number; useTrailingStop:boolean; useKelly:boolean; commissionPct:number; slippagePct:number; periodDays:number; }
export interface BacktestResult { config:BacktestConfig; trades:Trade[]; finalCapital:number; totalReturn:number; sharpeRatio:number; maxDrawdown:number; winRate:number; profitFactor:number; }
export type MarketRegime = 'bull'|'bear'|'high_vol'|'low_vol'|'sideways';
EOF

[ ! -f "src/app/api/health/route.ts" ] && cat > src/app/api/health/route.ts << 'EOF'
import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ status:'ok', version:'5.0.0', ts: new Date().toISOString(), uptime: process.uptime() }); }
EOF

[ ! -f "src/app/layout.tsx" ] && cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Nexus Pro', description: 'Trading Analytics' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="it" className="dark"><head><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" /></head>
    <body className="bg-nexus-bg text-nexus-text font-sans antialiased">{children}</body></html>);
}
EOF

[ ! -f "src/app/globals.css" ] && cat > src/app/globals.css << 'EOF'
@tailwind base; @tailwind components; @tailwind utilities;
:root { --nexus-bg:#0a0e17; --nexus-surface:#111827; --nexus-accent:#06b6d4; --nexus-profit:#22c55e; --nexus-loss:#ef4444; }
body { background: var(--nexus-bg); overflow-x: hidden; }
::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--nexus-bg); }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
EOF

[ ! -f "src/app/page.tsx" ] && cat > src/app/page.tsx << 'EOF'
export default function Home() {
  return (<main className="min-h-screen flex items-center justify-center"><div className="text-center space-y-6">
    <h1 className="text-6xl font-bold font-display tracking-tight"><span className="text-nexus-accent">NEXUS</span> PRO</h1>
    <p className="text-nexus-muted text-lg">Trading Analytics &amp; Simulation Platform</p>
    <div className="text-sm text-nexus-muted/50 font-mono">v5.0.0</div></div></main>);
}
EOF

step "Source files creati/verificati"

###############################################################################
# 7. OPENCLAW AGENTS
###############################################################################
banner "FIX 7 · OPENCLAW AGENTS"

[ ! -f "agents/trading-analyst/agent.json" ] && echo '{"name":"nexus-trading-analyst","version":"1.0.0","description":"Analisi tecnica e segnali","tasks":[{"id":"analyze_asset","input":{"asset":"string","timeframe":"string"}},{"id":"scan_opportunities","input":{"watchlist":"string[]"}}]}' > agents/trading-analyst/agent.json
[ ! -f "agents/risk-manager/agent.json" ] && echo '{"name":"nexus-risk-manager","version":"1.0.0","description":"Gestione rischio","tasks":[{"id":"check_portfolio_risk","input":{"user_id":"string"}},{"id":"size_position","input":{"asset":"string","confidence":"number"}}]}' > agents/risk-manager/agent.json
[ ! -f "agents/market-scanner/agent.json" ] && echo '{"name":"nexus-market-scanner","version":"1.0.0","description":"Scansione breakout e regime","tasks":[{"id":"scan_breakouts","input":{"assets":"string[]"}},{"id":"detect_regime_change","input":{}}]}' > agents/market-scanner/agent.json
[ ! -f "agents/report-generator/agent.json" ] && echo '{"name":"nexus-report-generator","version":"1.0.0","description":"Report performance","tasks":[{"id":"daily_report","input":{"user_id":"string"}}]}' > agents/report-generator/agent.json

[ ! -f "agents/config/runner.js" ] && cat > agents/config/runner.js << 'EOF'
const path=require('path'),fs=require('fs');
const DIR=path.resolve(__dirname,'..');
const EP=process.env.OPENCLAW_ENDPOINT||'http://localhost:8800';
const ON=process.env.OPENCLAW_ENABLED==='true';
function load(){return fs.readdirSync(DIR).filter(d=>fs.existsSync(path.join(DIR,d,'agent.json'))).map(d=>({...JSON.parse(fs.readFileSync(path.join(DIR,d,'agent.json'),'utf8')),dir:d}));}
async function main(){
  console.log('\n=== NEXUS PRO — Agents ===\n');
  const agents=load(); agents.forEach(a=>console.log(`  ${a.name} — ${a.tasks.length} tasks`));
  if(ON){console.log(`\nOpenClaw: ${EP}`);for(const a of agents){try{const r=await fetch(`${EP}/agents/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a)});console.log(`  ${r.ok?'✓':'⚠'} ${a.name}`);}catch(e){console.error(`  ✗ ${a.name}: ${e.message}`);}}}
  else{console.log('\nStandalone mode (set OPENCLAW_ENABLED=true to connect)');}
} main().catch(console.error);
EOF

step "4 agenti OpenClaw configurati"

###############################################################################
# 8. DOCKER (WSL-compatibile)
###############################################################################
banner "FIX 8 · DOCKER"

[ ! -f "docker/docker-compose.dev.yml" ] && cat > docker/docker-compose.dev.yml << 'EOF'
version: "3.9"
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
    command: redis-server --appendonly yes --maxmemory 256mb
    healthcheck: { test: ["CMD","redis-cli","ping"], interval: 10s, timeout: 5s, retries: 5 }
volumes:
  redis_data:
EOF
step "docker-compose.dev.yml"

###############################################################################
# 9. SCRIPTS
###############################################################################
banner "FIX 9 · SCRIPTS"

cat > scripts/dev-start.sh << 'DEVSTART'
#!/usr/bin/env bash
set -euo pipefail
echo "=== NEXUS PRO — Avvio ==="
for port in 3000 3001; do pid=$(lsof -ti ":$port" 2>/dev/null || true); [ -n "$pid" ] && kill "$pid" 2>/dev/null && echo "Porta $port liberata"; done
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  echo "→ Redis..."; docker compose -f docker/docker-compose.dev.yml up -d 2>/dev/null || true
else echo "⚠ Docker non disponibile — Redis skip"; fi
echo "→ Next.js..."; pnpm dev &
echo ""; echo "  http://localhost:3000"; echo ""
wait
DEVSTART
chmod +x scripts/dev-start.sh

cat > scripts/health-check.sh << 'HEALTH'
#!/usr/bin/env bash
echo "=== Health Check ==="
curl -sf http://localhost:3000/api/health 2>/dev/null && echo "  ✓ App OK" || echo "  ✗ App down"
command -v docker &>/dev/null && docker ps 2>/dev/null | grep -q redis && echo "  ✓ Redis OK" || echo "  ⚠ Redis off"
HEALTH
chmod +x scripts/health-check.sh
step "Scripts creati"

###############################################################################
# 10. README + GIT
###############################################################################
banner "FIX 10 · README + GIT"

[ ! -f "README.md" ] && cat > README.md << 'EOF'
# NEXUS PRO v5.0
> Trading Analytics & Simulation

```bash
pnpm install
# compila .env.local con chiavi Supabase
./scripts/dev-start.sh
# apri http://localhost:3000
```

Sviluppo: `claude` nel terminale, poi chiedi di implementare componenti.

⚠️ Sistema di simulazione. Non è consulenza finanziaria.
EOF

if [ ! -d ".git" ]; then
  git init && git add -A && git commit -m "feat: Nexus Pro v5.0.0"
  step "Git inizializzato"
else
  git add -A && git diff --cached --quiet || git commit -m "fix: setup completato WSL" || true
  step "Git aggiornato"
fi

###############################################################################
# 11. PNPM INSTALL
###############################################################################
banner "FIX 11 · DIPENDENZE NODE"

info "pnpm install (2-3 minuti)..."
pnpm install 2>&1 | tail -10
step "Dipendenze installate"

###############################################################################
# RIEPILOGO
###############################################################################
banner "TUTTO FATTO!"

echo -e "
${G}  ✓ Supabase CLI installato${NC}
${G}  ✓ Struttura completa${NC}
${G}  ✓ Configurazioni${NC}
${G}  ✓ 4 migrations SQL${NC}
${G}  ✓ Source files TS${NC}
${G}  ✓ 4 agenti OpenClaw${NC}
${G}  ✓ Docker config${NC}
${G}  ✓ Scripts${NC}
${G}  ✓ Node modules${NC}
${G}  ✓ Git${NC}

${Y}DOCKER (opzionale ora):${NC}
  Apri Docker Desktop su Windows
  Settings → Resources → WSL Integration → Ubuntu ON
  Poi: docker compose -f docker/docker-compose.dev.yml up -d

${W}PROSSIMI PASSI:${NC}

  ${C}1.${NC} Crea progetto su ${Y}https://supabase.com${NC}
  ${C}2.${NC} Copia URL + anon key: ${Y}nano .env.local${NC}
  ${C}3.${NC} Collega DB:
     ${Y}supabase login${NC}
     ${Y}supabase link --project-ref TUO_REF${NC}
     ${Y}supabase db push${NC}
  ${C}4.${NC} Avvia: ${Y}./scripts/dev-start.sh${NC}
  ${C}5.${NC} Sviluppa: ${Y}claude${NC}
"
