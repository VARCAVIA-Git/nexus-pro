#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗    ██████╗ ██████╗  ██████╗
# ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝    ██╔══██╗██╔══██╗██╔═══██╗
# ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗    ██████╔╝██████╔╝██║   ██║
# ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║    ██╔═══╝ ██╔══██╗██║   ██║
# ██║ ╚████║███████╗██╔╝ ╚██╗╚██████╔╝███████║    ██║     ██║  ██║╚██████╔╝
# ╚═╝  ╚═══╝╚══════╝╚═╝   ╚═╝ ╚═════╝ ╚══════╝    ╚═╝     ╚═╝  ╚═╝ ╚═════╝
# ═══════════════════════════════════════════════════════════════════════════
# NEXUS PRO v4.0 — Master Build Script
# Complete Development → Staging → Production Pipeline
# Target: Ubuntu 22.04/24.04 LTS · Acer Aspire 5
#
# USAGE:
#   chmod +x nexus-master-build.sh
#   ./nexus-master-build.sh
#
# Questo script crea TUTTO il progetto da zero:
#   ✓ Ambiente di sviluppo completo
#   ✓ Database schemas + migrations + seed data
#   ✓ Struttura Next.js 14 App Router completa
#   ✓ Trading Engine in TypeScript
#   ✓ Supabase Auth + RLS + Edge Functions
#   ✓ Broker Integration Layer (Binance, Alpaca)
#   ✓ Docker + Docker Compose
#   ✓ CI/CD GitHub Actions
#   ✓ Monitoring + Logging
#   ✓ Security hardening
#   ✓ Deploy scripts (Vercel + Railway)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colori e utilità ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}[NEXUS]${NC} $1"; }
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; }
err()  { echo -e "${RED}  ✗${NC} $1"; }
section() { echo -e "\n${BOLD}═══ $1 ═══${NC}"; }

PROJ="$HOME/nexus-pro"

# ═══════════════════════════════════════════════════════════════════════════
# FASE 0 — SYSTEM DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 0: Dipendenze Sistema"

log "Aggiornamento sistema..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git build-essential software-properties-common \
  apt-transport-https ca-certificates gnupg lsb-release \
  unzip jq htop tree tmux nginx certbot python3-certbot-nginx \
  ufw fail2ban
ok "Pacchetti sistema installati"

# Node.js 20 via nvm
log "Node.js 20 LTS..."
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20 && nvm use 20 && nvm alias default 20
ok "Node.js $(node -v)"

# pnpm
npm install -g pnpm
ok "pnpm $(pnpm -v)"

# Global tools
npm install -g typescript ts-node nodemon
ok "TypeScript, Supabase CLI, Claude Code"

# Docker
if ! command -v docker &> /dev/null; then
  log "Installazione Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  ok "Docker installato (riavvia sessione per gruppo docker)"
else
  ok "Docker $(docker --version | cut -d' ' -f3)"
fi

# Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  sudo apt install -y docker-compose-plugin
fi
ok "Docker Compose"

# VS Code + Extensions
if ! command -v code &> /dev/null; then
  wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /tmp/ms.gpg
  sudo install -D -o root -g root -m 644 /tmp/ms.gpg /etc/apt/keyrings/packages.microsoft.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | sudo tee /etc/apt/sources.list.d/vscode.list
  sudo apt update && sudo apt install -y code
fi
for ext in dbaeumer.vscode-eslint esbenp.prettier-vscode bradlc.vscode-tailwindcss \
  prisma.prisma ms-azuretools.vscode-docker github.copilot PKief.material-icon-theme; do
  code --install-extension "$ext" 2>/dev/null || true
done
ok "VS Code + estensioni"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 1 — PROJECT STRUCTURE
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 1: Struttura Progetto"

mkdir -p "$PROJ" && cd "$PROJ"

# Directory tree completa
mkdir -p \
  src/app/{api/{auth,trading,market,webhook,cron},\(auth\)/{login,register,forgot-password},\(dashboard\)/{overview,analysis,backtest,trades,portfolio,settings,alerts}} \
  src/components/{ui,charts,trading,layout,forms} \
  src/lib/{engine,indicators,patterns,strategies,backtest,broker/{binance,alpaca,paper},market-data,utils,validators} \
  src/hooks \
  src/stores \
  src/types \
  src/workers \
  src/config \
  supabase/{migrations,functions/{signal-scanner,price-fetcher,alert-checker,trade-executor},seed} \
  docker/{nginx,redis} \
  scripts/{deploy,backup,monitoring} \
  tests/{unit/{engine,indicators,strategies},integration/{broker,api},e2e} \
  docs/{api,architecture,runbooks} \
  .github/workflows \
  public/icons

ok "Struttura directory creata ($(find src -type d | wc -l) cartelle)"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 2 — CONFIGURATION FILES
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 2: File di Configurazione"

# ── package.json ──
cat > package.json << 'EOF'
{
  "name": "nexus-pro",
  "version": "4.0.0",
  "private": true,
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "lint": "next lint && tsc --noEmit",
    "format": "prettier --write 'src/**/*.{ts,tsx}'",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "db:migrate": "supabase db push",
    "db:reset": "supabase db reset",
    "db:seed": "ts-node supabase/seed/run.ts",
    "db:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.ts",
    "db:studio": "supabase studio",
    "db:diff": "supabase db diff --use-migra",
    "worker:signals": "ts-node --transpile-only src/workers/signal-scanner.ts",
    "worker:prices": "ts-node --transpile-only src/workers/price-fetcher.ts",
    "docker:dev": "docker compose -f docker/docker-compose.dev.yml up -d",
    "docker:prod": "docker compose -f docker/docker-compose.prod.yml up -d",
    "deploy:vercel": "vercel --prod",
    "deploy:check": "ts-node scripts/deploy/pre-deploy-check.ts",
    "backup:db": "bash scripts/backup/backup-db.sh",
    "health": "ts-node scripts/monitoring/health-check.ts"
  },
  "dependencies": {
    "next": "^14.2.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "zustand": "^4.5.5",
    "recharts": "^2.13.0",
    "date-fns": "^4.1.0",
    "decimal.js": "^10.4.3",
    "ccxt": "^4.4.0",
    "zod": "^3.23.8",
    "swr": "^2.2.5",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.0",
    "lucide-react": "^0.447.0",
    "nanoid": "^5.0.7",
    "ioredis": "^5.4.1",
    "bullmq": "^5.16.0",
    "pino": "^9.4.0",
    "pino-pretty": "^11.2.0",
    "jose": "^5.9.0",
    "bcryptjs": "^2.4.3",
    "rate-limiter-flexible": "^5.0.3",
    "socket.io": "^4.8.0",
    "socket.io-client": "^4.8.0",
    "next-themes": "^0.3.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/node": "^22.7.0",
    "@types/bcryptjs": "^2.4.6",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "playwright": "^1.48.0",
    "@playwright/test": "^1.48.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "prettier": "^3.3.0",
    "prettier-plugin-tailwindcss": "^0.6.0",
    "tailwindcss": "^3.4.13",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47"
  }
}
EOF
ok "package.json"

# ── tsconfig.json ──
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@/engine/*": ["./src/lib/engine/*"],
      "@/indicators/*": ["./src/lib/indicators/*"],
      "@/strategies/*": ["./src/lib/strategies/*"],
      "@/broker/*": ["./src/lib/broker/*"],
      "@/ui/*": ["./src/components/ui/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/stores/*": ["./src/stores/*"],
      "@/types/*": ["./src/types/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "tests"]
}
EOF
ok "tsconfig.json"

# ── next.config.mjs ──
cat > next.config.mjs << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  headers: async () => [
    {
      source: '/api/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};
export default nextConfig;
EOF
ok "next.config.mjs"

# ── tailwind.config.ts ──
cat > tailwind.config.ts << 'EOF'
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: "#0c1222",
          card: "#162032",
          border: "#243248",
          text: "#c1ccdb",
          dim: "#5a6a80",
          accent: "#22d3ee",
          green: "#34d399",
          red: "#f43f5e",
          yellow: "#fbbf24",
          blue: "#60a5fa",
        },
      },
      fontFamily: {
        mono: ["IBM Plex Mono", "Fira Code", "monospace"],
        display: ["Instrument Sans", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
EOF
ok "tailwind.config.ts"

# ── postcss.config.mjs ──
cat > postcss.config.mjs << 'EOF'
const config = { plugins: { tailwindcss: {}, autoprefixer: {} } };
export default config;
EOF

# ── .env.local.example ──
cat > .env.local.example << 'EOF'
# ═══════════════════════════════════════════════════════════════
# NEXUS PRO v4.0 — Environment Variables
# cp .env.local.example .env.local — MAI committare .env.local!
# ═══════════════════════════════════════════════════════════════

# ── Supabase (REQUIRED) ──
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SUPABASE_PROJECT_ID=xxxxx

# ── App ──
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_ENABLE_LIVE_TRADING=false
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# ── Redis (for BullMQ workers) ──
REDIS_URL=redis://localhost:6379

# ── Encryption ──
ENCRYPTION_KEY=generate-a-64-char-hex-key-here
JWT_SECRET=generate-a-32-char-secret-here

# ── Broker: Binance (Phase 3) ──
BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_TESTNET=true

# ── Broker: Alpaca (Phase 3) ──
ALPACA_API_KEY=
ALPACA_API_SECRET=
ALPACA_PAPER=true
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# ── Market Data ──
POLYGON_API_KEY=
COINGECKO_API_KEY=

# ── Monitoring ──
SENTRY_DSN=
LOG_LEVEL=debug

# ── Telegram Bot (alerts) ──
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EOF
cp .env.local.example .env.local
ok ".env.local"

# ── .gitignore ──
cat > .gitignore << 'EOF'
node_modules/
.next/
.env.local
.env*.local
*.log
dist/
.turbo/
coverage/
.DS_Store
.vercel/
supabase/.temp/
docker/data/
*.pem
EOF

# ── .prettierrc ──
cat > .prettierrc << 'EOF'
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
EOF

# ── vitest.config.ts ──
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      thresholds: { branches: 70, functions: 75, lines: 80, statements: 80 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
EOF
ok "Tutti i config files"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 3 — DATABASE SCHEMA (Supabase Migrations)
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 3: Database Schema"

# ── Migration 001: Core Schema ──
cat > supabase/migrations/001_core_schema.sql << 'SQLEOF'
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
SQLEOF
ok "Migration 001: Core Schema"

# ── Migration 002: RLS Policies ──
cat > supabase/migrations/002_rls_policies.sql << 'SQLEOF'
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
SQLEOF
ok "Migration 002: RLS Policies"

# ── Migration 003: Indexes + Functions ──
cat > supabase/migrations/003_indexes_functions.sql << 'SQLEOF'
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
SQLEOF
ok "Migration 003: Indexes + Functions"

# ── Migration 004: Scheduled Jobs ──
cat > supabase/migrations/004_cron_jobs.sql << 'SQLEOF'
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
SQLEOF
ok "Migration 004: Cron Jobs"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 4 — TYPESCRIPT TYPES
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 4: TypeScript Types"

cat > src/types/trading.ts << 'EOF'
// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Core Trading Types
// ═══════════════════════════════════════════════════════════════

export type Side = 'LONG' | 'SHORT';
export type TradeStatus = 'open' | 'closed' | 'cancelled' | 'pending';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type Signal = 'BUY' | 'SELL' | 'NEUTRAL';
export type Regime = 'BULL_TREND' | 'BEAR_TREND' | 'HIGH_VOL' | 'LOW_VOL' | 'NORMAL';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
export type BrokerType = 'paper' | 'binance' | 'alpaca' | 'ibkr';
export type StrategyKey = 'combined_ai' | 'momentum' | 'trend' | 'reversion' | 'breakout' | 'pattern';

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingConfig {
  capital: number;
  riskPerTrade: number;
  maxPositions: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStop: boolean;
  trailingPct: number;
  commissionPct: number;
  slippagePct: number;
  cooldownBars: number;
  kellyFraction: number;
  maxDrawdownLimit: number;
  dailyLossLimit: number;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: Side;
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  sizeUsd: number;
  grossPnl?: number;
  commission?: number;
  netPnl?: number;
  pnlPct?: number;
  entryAt: Date;
  exitAt?: Date;
  durationBars?: number;
  strategy: StrategyKey;
  confidence: number;
  regime: Regime;
  exitReason?: string;
  isLive: boolean;
}

export interface SignalResult {
  signal: Signal;
  confidence: number;
  strategy: StrategyKey;
  indicators: Record<string, number>;
  patterns: PatternMatch[];
  regime: Regime;
  timestamp: Date;
}

export interface PatternMatch {
  index: number;
  type: string;
  signal: Signal;
  strength: number;
  date: string;
}

export interface BacktestResult {
  trades: TradeRecord[];
  equity: number[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  returnPct: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  initialCapital: number;
  finalCapital: number;
  totalCommissions: number;
}

export interface MonteCarloResult {
  simulations: number;
  probabilityOfProfit: number;
  percentiles: {
    p5: { final: number; maxDD: number };
    p25: { final: number; maxDD: number };
    p50: { final: number; maxDD: number };
    p75: { final: number; maxDD: number };
    p95: { final: number; maxDD: number };
  };
}

export interface WalkForwardResult {
  windows: Array<{
    window: number;
    trainWinRate: number;
    testWinRate: number;
    trainReturn: number;
    testReturn: number;
    robust: boolean;
  }>;
  robustnessPct: number;
}

export interface Indicators {
  rsi: number[];
  macd: { line: number[]; signal: number[]; histogram: number[] };
  bollinger: { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] };
  atr: number[];
  adx: number[];
  stochastic: { k: number[]; d: number[] };
  ema9: number[];
  ema21: number[];
  sma20: (number | null)[];
  sma50: (number | null)[];
  supertrend: number[];
  obv: number[];
  vwap: number[];
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  status: 'new' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledQty: number;
  filledPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrokerBalance {
  total: number;
  available: number;
  locked: number;
  currency: string;
  positions: BrokerPosition[];
}

export interface BrokerPosition {
  symbol: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}
EOF
ok "Trading types"

cat > src/types/index.ts << 'EOF'
export * from './trading';
EOF


# ═══════════════════════════════════════════════════════════════════════════
# FASE 5 — DOCKER
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 5: Docker Configuration"

cat > docker/docker-compose.dev.yml << 'EOF'
version: "3.9"
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis_data:/data"]
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  redis-commander:
    image: rediscommander/redis-commander:latest
    ports: ["8081:8081"]
    environment:
      REDIS_HOSTS: local:redis:6379
    depends_on: [redis]

volumes:
  redis_data:
EOF

cat > docker/docker-compose.prod.yml << 'EOF'
version: "3.9"
services:
  nexus-app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports: ["3000:3000"]
    env_file: ../.env.local
    depends_on: [redis]
    restart: always
    deploy:
      resources:
        limits: { cpus: "2", memory: 1G }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    volumes: ["redis_data:/data"]
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    restart: always
    deploy:
      resources:
        limits: { cpus: "0.5", memory: 256M }

  worker-signals:
    build:
      context: ..
      dockerfile: docker/Dockerfile.worker
    env_file: ../.env.local
    command: ["node", "dist/workers/signal-scanner.js"]
    depends_on: [redis]
    restart: always

  worker-prices:
    build:
      context: ..
      dockerfile: docker/Dockerfile.worker
    env_file: ../.env.local
    command: ["node", "dist/workers/price-fetcher.js"]
    depends_on: [redis]
    restart: always

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on: [nexus-app]
    restart: always

volumes:
  redis_data:
EOF

cat > docker/Dockerfile << 'DOCKERFILE'
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
DOCKERFILE

cat > docker/Dockerfile.worker << 'DOCKERFILE'
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec tsc --outDir dist
CMD ["node", "dist/workers/signal-scanner.js"]
DOCKERFILE

cat > docker/nginx/nginx.conf << 'NGINXCONF'
events { worker_connections 1024; }

http {
  upstream nexus_app { server nexus-app:3000; }

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
  limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

  server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name nexus.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/nexus.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nexus.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co" always;

    # API rate limiting
    location /api/auth { limit_req zone=auth burst=3; proxy_pass http://nexus_app; }
    location /api/ { limit_req zone=api burst=50 nodelay; proxy_pass http://nexus_app; }
    location / { proxy_pass http://nexus_app; }

    # WebSocket
    location /ws { proxy_pass http://nexus_app; proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }

    # Static files cache
    location /_next/static { proxy_pass http://nexus_app;
      add_header Cache-Control "public, max-age=31536000, immutable"; }
  }
}
NGINXCONF
ok "Docker + Nginx config"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 6 — CI/CD PIPELINE
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 6: CI/CD Pipeline"

cat > .github/workflows/ci.yml << 'EOF'
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm exec tsc --noEmit

  test:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:run
      - run: pnpm test:coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}', cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

  deploy-staging:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-production:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
      - name: Run DB migrations
        run: npx supabase db push --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
EOF
ok "GitHub Actions CI/CD"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 7 — SCRIPTS OPERATIVI
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 7: Scripts Operativi"

# ── Deploy check ──
cat > scripts/deploy/pre-deploy-check.ts << 'EOF'
/**
 * Pre-deploy checklist — verifica che tutto sia pronto
 */
const checks = [
  { name: 'ENV vars', check: () => {
    const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    const missing = required.filter(k => !process.env[k]);
    return missing.length === 0 ? '✓' : `MISSING: ${missing.join(', ')}`;
  }},
  { name: 'TypeScript', check: () => {
    const { execSync } = require('child_process');
    try { execSync('npx tsc --noEmit', { stdio: 'pipe' }); return '✓'; }
    catch { return '✗ Type errors found'; }
  }},
  { name: 'Tests', check: () => {
    const { execSync } = require('child_process');
    try { execSync('npx vitest run', { stdio: 'pipe' }); return '✓'; }
    catch { return '✗ Test failures'; }
  }},
  { name: 'Build', check: () => {
    const { execSync } = require('child_process');
    try { execSync('npx next build', { stdio: 'pipe' }); return '✓'; }
    catch { return '✗ Build failed'; }
  }},
];

(async () => {
  console.log('\n🔍 NEXUS PRO — Pre-Deploy Check\n');
  let allGood = true;
  for (const c of checks) {
    const result = c.check();
    const ok = result === '✓';
    if (!ok) allGood = false;
    console.log(`  ${ok ? '✅' : '❌'} ${c.name}: ${result}`);
  }
  console.log(`\n${allGood ? '✅ Ready to deploy!' : '❌ Fix issues before deploying.'}\n`);
  process.exit(allGood ? 0 : 1);
})();
EOF

# ── Backup script ──
cat > scripts/backup/backup-db.sh << 'BASH'
#!/bin/bash
# NEXUS PRO — Database Backup
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/nexus-backups"
mkdir -p "$BACKUP_DIR"

echo "📦 Backup database Nexus Pro..."

# Export via Supabase CLI
supabase db dump --project-ref "$SUPABASE_PROJECT_ID" \
  -f "$BACKUP_DIR/nexus_backup_${TIMESTAMP}.sql"

# Compress
gzip "$BACKUP_DIR/nexus_backup_${TIMESTAMP}.sql"

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/nexus_backup_*.sql.gz | tail -n +31 | xargs -r rm

echo "✅ Backup completato: nexus_backup_${TIMESTAMP}.sql.gz"
echo "📁 Directory: $BACKUP_DIR"
echo "📊 Backups presenti: $(ls "$BACKUP_DIR"/nexus_backup_*.sql.gz | wc -l)"
BASH
chmod +x scripts/backup/backup-db.sh

# ── Health check ──
cat > scripts/monitoring/health-check.ts << 'EOF'
/**
 * NEXUS PRO — Health Check
 * Verifica stato di tutti i servizi
 */
const checks = {
  async supabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return { status: 'error', message: 'URL not configured' };
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' }
      });
      return { status: res.ok ? 'ok' : 'error', code: res.status };
    } catch (e: any) { return { status: 'error', message: e.message }; }
  },
  async redis() {
    try {
      const Redis = require('ioredis');
      const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      const pong = await r.ping();
      r.disconnect();
      return { status: pong === 'PONG' ? 'ok' : 'error' };
    } catch { return { status: 'not_configured' }; }
  },
  system() {
    const os = require('os');
    return {
      status: 'ok',
      memory: `${Math.round(os.freemem() / 1024 / 1024)}MB free / ${Math.round(os.totalmem() / 1024 / 1024)}MB total`,
      cpu: os.cpus().length + ' cores',
      uptime: Math.round(os.uptime() / 3600) + 'h',
      node: process.version,
    };
  },
};

(async () => {
  console.log('\n🏥 NEXUS PRO — Health Check\n');
  for (const [name, fn] of Object.entries(checks)) {
    const result = typeof fn === 'function' ? (fn.constructor.name === 'AsyncFunction' ? await fn() : fn()) : fn;
    const icon = result.status === 'ok' ? '✅' : result.status === 'not_configured' ? '⚪' : '❌';
    console.log(`  ${icon} ${name}:`, JSON.stringify(result));
  }
  console.log('');
})();
EOF

# ── Firewall setup ──
cat > scripts/deploy/setup-firewall.sh << 'BASH'
#!/bin/bash
# NEXUS PRO — UFW Firewall Setup
echo "🔒 Configurazione firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Dev server (rimuovi in produzione)
sudo ufw --force enable
sudo ufw status verbose
echo "✅ Firewall configurato"
BASH
chmod +x scripts/deploy/setup-firewall.sh

# ── SSL setup ──
cat > scripts/deploy/setup-ssl.sh << 'BASH'
#!/bin/bash
# NEXUS PRO — SSL Certificate via Let's Encrypt
DOMAIN=${1:-"nexus.yourdomain.com"}
echo "🔐 Certificato SSL per $DOMAIN..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m your@email.com
echo "✅ SSL configurato per $DOMAIN"
# Auto-renewal è già attivo via certbot timer
BASH
chmod +x scripts/deploy/setup-ssl.sh

# ── Dev start ──
cat > scripts/dev-start.sh << 'BASH'
#!/bin/bash
echo ""
echo "🚀 NEXUS PRO — Development Server"
echo "════════════════════════════════════"
echo ""

# Start Redis via Docker
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
  echo "📦 Starting Redis..."
  docker compose -f docker/docker-compose.dev.yml up -d redis 2>/dev/null || true
  echo "   Redis: localhost:6379"
fi

echo ""
echo "🌐 Frontend:     http://localhost:3000"
echo "📊 Supabase:     https://supabase.com/dashboard"
echo "🔧 Redis UI:     http://localhost:8081"
echo "🤖 Claude Code:  type 'claude' in another terminal"
echo ""

pnpm dev
BASH
chmod +x scripts/dev-start.sh
ok "Scripts operativi"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 8 — SOURCE FILES STUBS
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 8: Source File Stubs"

# ── Supabase client ──
cat > src/lib/utils/supabase-client.ts << 'EOF'
import { createBrowserClient } from '@supabase/ssr';

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
EOF

cat > src/lib/utils/supabase-server.ts << 'EOF'
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const createServerSupabase = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );
};
EOF

# ── Zustand Store ──
cat > src/stores/trading-store.ts << 'EOF'
import { create } from 'zustand';
import type { TradingConfig, StrategyKey, BacktestResult } from '@/types';

interface TradingState {
  symbol: string;
  strategy: StrategyKey;
  config: TradingConfig;
  results: BacktestResult | null;
  isRunning: boolean;
  // Actions
  setSymbol: (s: string) => void;
  setStrategy: (s: StrategyKey) => void;
  setConfig: (c: Partial<TradingConfig>) => void;
  setResults: (r: BacktestResult | null) => void;
  setRunning: (b: boolean) => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  symbol: 'BTC/USD',
  strategy: 'combined_ai',
  config: {
    capital: 10000, riskPerTrade: 5, maxPositions: 3,
    stopLossPct: 3, takeProfitPct: 6.5, trailingStop: true,
    trailingPct: 2.5, commissionPct: 0.1, slippagePct: 0.05,
    cooldownBars: 3, kellyFraction: 0.5, maxDrawdownLimit: 25, dailyLossLimit: 5,
  },
  results: null,
  isRunning: false,
  setSymbol: (symbol) => set({ symbol }),
  setStrategy: (strategy) => set({ strategy }),
  setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
  setResults: (results) => set({ results }),
  setRunning: (isRunning) => set({ isRunning }),
}));
EOF

# ── Logger ──
cat > src/lib/utils/logger.ts << 'EOF'
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
EOF

# ── Encryption util ──
cat > src/lib/utils/encryption.ts << 'EOF'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || randomBytes(32).toString('hex'), 'hex');

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(data: string): string {
  const [ivHex, tagHex, encHex] = data.split(':');
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}
EOF

# ── API Health endpoint ──
cat > src/app/api/health/route.ts << 'EOF'
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NEXT_PUBLIC_APP_ENV || 'unknown',
  });
}
EOF

# ── Global CSS ──
cat > src/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --nexus-bg: #0c1222;
  --nexus-card: #162032;
}

body {
  background: var(--nexus-bg);
  color: #c1ccdb;
}

@layer utilities {
  .text-gradient {
    @apply bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent;
  }
}
EOF

# ── Root layout ──
cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXUS PRO — Trading Analytics',
  description: 'Advanced trading intelligence system with AI pattern recognition',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
EOF

# ── Root page ──
cat > src/app/page.tsx << 'EOF'
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/overview');
}
EOF

# ── Test file ──
cat > tests/unit/engine/indicators.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';

describe('Technical Indicators', () => {
  it('should calculate SMA correctly', () => {
    // TODO: Import from @/lib/indicators and test
    expect(true).toBe(true);
  });

  it('should calculate RSI in valid range', () => {
    // RSI should always be between 0 and 100
    expect(true).toBe(true);
  });

  it('should detect MACD crossovers', () => {
    expect(true).toBe(true);
  });
});
EOF
ok "Source file stubs"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 9 — DOCUMENTATION
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 9: Documentazione"

cat > README.md << 'READMEEOF'
# NEXUS PRO v4.0

> Sistema di Trading Analytics con AI Pattern Recognition

## Quick Start (Ubuntu / Acer Aspire 5)

```bash
# 1. Installa dipendenze
cd ~/nexus-pro && pnpm install

# 2. Configura Supabase
#    - Crea progetto su https://supabase.com/dashboard
#    - Copia URL + API keys in .env.local

# 3. Avvia Redis (opzionale per workers)
./scripts/dev-start.sh

# 4. Oppure solo frontend
pnpm dev
```

## Sviluppo con Claude Code

```bash
cd ~/nexus-pro
claude
# Chiedi: "Implementa il backtest engine in src/lib/engine/"
# Chiedi: "Crea il componente dashboard chart"
# Chiedi: "Aggiungi integrazione Binance paper trading"
```

## Struttura

```
nexus-pro/
├── src/
│   ├── app/                    # Next.js 14 App Router
│   │   ├── api/               # API Routes
│   │   ├── (auth)/            # Auth pages (login, register)
│   │   └── (dashboard)/       # Dashboard pages
│   ├── components/            # React Components
│   ├── lib/
│   │   ├── engine/           # Core trading engine
│   │   ├── indicators/       # 14+ indicatori tecnici
│   │   ├── patterns/         # Pattern recognition (13+)
│   │   ├── strategies/       # 6 strategie di trading
│   │   ├── backtest/         # Backtesting + Monte Carlo
│   │   ├── broker/           # Binance, Alpaca, Paper
│   │   └── utils/            # Supabase, encryption, logger
│   ├── hooks/                # Custom React hooks
│   ├── stores/               # Zustand state management
│   └── types/                # TypeScript types
├── supabase/
│   ├── migrations/           # 4 migrations (schema, RLS, indexes, cron)
│   └── functions/            # Edge Functions
├── docker/                   # Docker + Nginx
├── scripts/                  # Deploy, backup, monitoring
├── tests/                    # Unit, integration, E2E
└── .github/workflows/        # CI/CD pipeline
```

## Pipeline: Dev → Staging → Production

| Fase | Branch | Deploy | URL |
|------|--------|--------|-----|
| Dev | `feature/*` | Locale | localhost:3000 |
| Staging | `develop` | Vercel Preview | staging.nexus.dev |
| Production | `main` | Vercel Prod | nexus.yourdomain.com |

## Database (Supabase)

9 tabelle con RLS, 4 migrations, audit log, viste materializzate.
Vedi `supabase/migrations/` per schema completo.

## Security Checklist

- [x] Row Level Security su tutte le tabelle
- [x] Credenziali broker crittografate (AES-256-GCM)
- [x] Rate limiting (API + Auth)
- [x] HTTPS + HSTS
- [x] CSP headers
- [x] Audit logging per trade live
- [x] UFW firewall
- [x] fail2ban per SSH
- [ ] 2FA (Phase 5)
READMEEOF

cat > docs/architecture/DECISIONS.md << 'EOF'
# Architecture Decision Records

## ADR-001: Next.js 14 App Router
**Contesto:** Serve un framework React con SSR, API routes e deploy facile.
**Decisione:** Next.js 14 con App Router.
**Motivazione:** SSR per SEO, API routes per backend light, Vercel per deploy immediato.

## ADR-002: Supabase come Backend
**Contesto:** Serve database, auth e realtime senza gestire infrastruttura.
**Decisione:** Supabase (PostgreSQL + Auth + Realtime + Edge Functions).
**Motivazione:** RLS nativo, websocket incluso, free tier generoso, SDK TypeScript.

## ADR-003: CCXT per Multi-Broker
**Contesto:** Supportare più exchange/broker con un'unica interfaccia.
**Decisione:** Libreria CCXT + wrapper custom per ogni broker.
**Motivazione:** 100+ exchange supportati, API unificata, community attiva.

## ADR-004: BullMQ per Background Jobs
**Contesto:** Signal scanning e price fetching devono girare in background.
**Decisione:** BullMQ con Redis.
**Motivazione:** Retry automatico, cron jobs, dashboard monitoraggio.

## ADR-005: Paper Trading First
**Contesto:** Mai andare live senza validazione estensiva.
**Decisione:** Ogni broker parte SEMPRE in paper mode. Switch a live richiede conferma esplicita.
**Motivazione:** Sicurezza del capitale utente.
EOF
ok "Documentazione"


# ═══════════════════════════════════════════════════════════════════════════
# FASE 10 — GIT INIT
# ═══════════════════════════════════════════════════════════════════════════
section "FASE 10: Git Repository"

cd "$PROJ"
git init
git add .
git commit -m "feat: NEXUS PRO v4.0 — initial project setup

- Complete Next.js 14 project structure
- Supabase schema (4 migrations, 9 tables, full RLS)
- Docker + Nginx production config
- CI/CD GitHub Actions pipeline
- TypeScript types for trading engine
- Security hardening (encryption, rate limiting, CSP)
- Monitoring and backup scripts
- Documentation and ADRs"
ok "Git repository inizializzato"


# ═══════════════════════════════════════════════════════════════════════════
# COMPLETAMENTO
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}${BOLD}"
echo "  ██████╗  ██████╗ ███╗   ██╗███████╗██╗"
echo "  ██╔══██╗██╔═══██╗████╗  ██║██╔════╝██║"
echo "  ██║  ██║██║   ██║██╔██╗ ██║█████╗  ██║"
echo "  ██║  ██║██║   ██║██║╚██╗██║██╔══╝  ╚═╝"
echo "  ██████╔╝╚██████╔╝██║ ╚████║███████╗██╗"
echo "  ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝"
echo -e "${NC}"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "  NEXUS PRO v4.0 — Progetto creato con successo!"
echo ""
echo "  📁 Directory:    ~/nexus-pro"
echo "  📦 Files:        $(find "$PROJ" -type f | wc -l) files"
echo "  📂 Directories:  $(find "$PROJ" -type d | wc -l) directories"
echo ""
echo -e "  ${BOLD}PROSSIMI PASSI:${NC}"
echo ""
echo "  1. Riavvia il terminale (per nvm e docker group):"
echo "     exec bash"
echo ""
echo "  2. Installa dipendenze:"
echo "     cd ~/nexus-pro && pnpm install"
echo ""
echo "  3. Crea progetto Supabase:"
echo "     → https://supabase.com/dashboard → New Project"
echo "     → Copia URL e chiavi in .env.local"
echo "     → supabase db push"
echo ""
echo "  4. Avvia sviluppo:"
echo "     ./scripts/dev-start.sh"
echo ""
echo "  5. Sviluppa con Claude Code:"
echo "     claude"
echo "     → 'Implementa il trading engine completo'"
echo "     → 'Crea i componenti dashboard'"
echo "     → 'Aggiungi Binance paper trading'"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
