#!/usr/bin/env bash
###############################################################################
#  NEXUS PRO v5 — MASTER INIT SCRIPT
#  Esegui con:  chmod +x nexus-pro-init.sh && ./nexus-pro-init.sh
#
#  Cosa fa (in ordine):
#    0. Diagnostica sistema
#    1. Organizza i progetti esistenti sul PC
#    2. Libera porte 3000 / 3001
#    3. Installa dipendenze di sistema
#    4. Crea struttura progetto completa
#    5. Configura database Supabase (schema + RLS + migrations)
#    6. Configura Docker (dev + prod)
#    7. Configura CI/CD
#    8. Integra OpenClaw come agente locale
#    9. Primo avvio dev
###############################################################################

set -euo pipefail
IFS=$'\n\t'

# ── Colori ──────────────────────────────────────────────────────────────────
R='\033[0;31m'  G='\033[0;32m'  Y='\033[1;33m'
C='\033[0;36m'  B='\033[1;34m'  M='\033[0;35m'
W='\033[1;37m'  D='\033[0;90m'  NC='\033[0m'

banner() {
  echo ""
  echo -e "${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${W}  $1${NC}"
  echo -e "${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

step()  { echo -e "\n${G}  ✓ $1${NC}"; }
info()  { echo -e "  ${D}→ $1${NC}"; }
warn()  { echo -e "  ${Y}⚠ $1${NC}"; }
err()   { echo -e "  ${R}✗ $1${NC}"; }

NEXUS_HOME="$HOME/nexus-pro"
ARCHIVE="$HOME/projects-archive"
LOG_FILE="$NEXUS_HOME/setup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

exec > >(tee -a "$LOG_FILE") 2>&1

banner "NEXUS PRO v5 — SETUP COMPLETO"
echo -e "${D}  Timestamp: $TIMESTAMP${NC}"
echo -e "${D}  Log: $LOG_FILE${NC}"

###############################################################################
#  FASE 0 — DIAGNOSTICA SISTEMA
###############################################################################
banner "FASE 0 · DIAGNOSTICA SISTEMA"

echo -e "  ${W}Hardware:${NC}"
info "CPU: $(nproc) core — $(lscpu 2>/dev/null | grep 'Model name' | sed 's/.*: *//' || echo 'N/A')"
info "RAM: $(free -h | awk '/Mem:/ {print $2}') totale — $(free -h | awk '/Mem:/ {print $7}') disponibile"
info "Disco: $(df -h "$HOME" | awk 'NR==2 {print $4}') libero su $HOME"

echo -e "  ${W}Software:${NC}"
for cmd in git node npm pnpm docker docker-compose supabase claude; do
  if command -v "$cmd" &>/dev/null; then
    ver=$($cmd --version 2>/dev/null | head -1 || echo "ok")
    info "$cmd: $ver"
  else
    warn "$cmd: NON installato (verrà installato)"
  fi
done

# Controlla OpenClaw
echo -e "  ${W}OpenClaw:${NC}"
if command -v openclaw &>/dev/null; then
  info "OpenClaw trovato: $(openclaw --version 2>/dev/null || echo 'installato')"
  OPENCLAW_AVAILABLE=true
elif [ -d "$HOME/openclaw" ] || [ -d "$HOME/OpenClaw" ] || [ -d "/opt/openclaw" ]; then
  OPENCLAW_DIR=$(find "$HOME" /opt -maxdepth 2 -iname "openclaw" -type d 2>/dev/null | head -1)
  info "OpenClaw trovato in: $OPENCLAW_DIR"
  OPENCLAW_AVAILABLE=true
else
  # Cerca in modo più ampio
  OPENCLAW_DIR=$(find "$HOME" -maxdepth 3 -iname "*openclaw*" -type d 2>/dev/null | head -1 || true)
  if [ -n "$OPENCLAW_DIR" ]; then
    info "OpenClaw trovato in: $OPENCLAW_DIR"
    OPENCLAW_AVAILABLE=true
  else
    warn "OpenClaw non trovato — verrà configurato il placeholder"
    OPENCLAW_AVAILABLE=false
  fi
fi

###############################################################################
#  FASE 1 — ORGANIZZA IL PC
###############################################################################
banner "FASE 1 · ORGANIZZAZIONE PROGETTI ESISTENTI"

mkdir -p "$ARCHIVE"
mkdir -p "$HOME/projects"

# Cataloga tutti i progetti dev trovati in home
info "Scansione progetti esistenti in $HOME..."

declare -a FOUND_PROJECTS=()
while IFS= read -r -d '' pjson; do
  pdir=$(dirname "$pjson")
  # Ignora node_modules e la directory nexus-pro stessa
  if [[ "$pdir" != *"node_modules"* ]] && [[ "$pdir" != "$NEXUS_HOME"* ]]; then
    FOUND_PROJECTS+=("$pdir")
  fi
done < <(find "$HOME" -maxdepth 4 -name "package.json" -not -path "*/node_modules/*" -print0 2>/dev/null || true)

# Aggiungi anche progetti Python
while IFS= read -r -d '' req; do
  pdir=$(dirname "$req")
  if [[ "$pdir" != *".venv"* ]] && [[ "$pdir" != *"site-packages"* ]] && [[ "$pdir" != "$NEXUS_HOME"* ]]; then
    FOUND_PROJECTS+=("$pdir")
  fi
done < <(find "$HOME" -maxdepth 4 -name "requirements.txt" -not -path "*/.venv/*" -print0 2>/dev/null || true)

# Rimuovi duplicati
readarray -t UNIQUE_PROJECTS < <(printf '%s\n' "${FOUND_PROJECTS[@]}" | sort -u)

echo -e "\n  ${W}Progetti trovati: ${#UNIQUE_PROJECTS[@]}${NC}"

# Crea inventario
INVENTORY_FILE="$ARCHIVE/inventario_$TIMESTAMP.txt"
{
  echo "═══════════════════════════════════════════"
  echo " INVENTARIO PROGETTI — $TIMESTAMP"
  echo "═══════════════════════════════════════════"
  echo ""
} > "$INVENTORY_FILE"

for proj in "${UNIQUE_PROJECTS[@]}"; do
  proj_name=$(basename "$proj")
  proj_size=$(du -sh "$proj" 2>/dev/null | cut -f1)
  proj_type="unknown"

  [ -f "$proj/package.json" ] && proj_type="node"
  [ -f "$proj/requirements.txt" ] && proj_type="python"
  [ -f "$proj/Cargo.toml" ] && proj_type="rust"
  [ -f "$proj/go.mod" ] && proj_type="go"

  info "$proj_name ($proj_type, $proj_size) → $proj"
  echo "  [$proj_type] $proj_name — $proj_size — $proj" >> "$INVENTORY_FILE"
done

echo "" >> "$INVENTORY_FILE"
echo "Totale: ${#UNIQUE_PROJECTS[@]} progetti" >> "$INVENTORY_FILE"

step "Inventario salvato in $INVENTORY_FILE"

# Organizza: sposta progetti sparsi in ~/projects/ (crea symlink se erano altrove)
info "Creazione struttura organizzata in ~/projects/..."
mkdir -p "$HOME/projects/node"
mkdir -p "$HOME/projects/python"
mkdir -p "$HOME/projects/other"
mkdir -p "$HOME/projects/archived"

step "Struttura ~/projects/ creata (i progetti esistenti NON vengono spostati automaticamente)"
info "Consulta $INVENTORY_FILE per decidere cosa riorganizzare manualmente"

###############################################################################
#  FASE 2 — LIBERA PORTE 3000 / 3001
###############################################################################
banner "FASE 2 · LIBERAZIONE PORTE"

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti ":$port" 2>/dev/null || true)

  if [ -n "$pids" ]; then
    for pid in $pids; do
      local pname
      pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
      warn "Porta $port occupata da $pname (PID $pid)"

      # Prima prova SIGTERM (graceful)
      kill "$pid" 2>/dev/null || true
      sleep 1

      # Se ancora vivo, SIGKILL
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        info "Forzata chiusura PID $pid"
      else
        info "PID $pid terminato gracefully"
      fi
    done
    step "Porta $port liberata"
  else
    step "Porta $port già libera"
  fi
}

free_port 3000
free_port 3001

# Ferma anche container Docker su quelle porte
if command -v docker &>/dev/null; then
  for port in 3000 3001; do
    containers=$(docker ps --filter "publish=$port" -q 2>/dev/null || true)
    if [ -n "$containers" ]; then
      docker stop $containers 2>/dev/null || true
      info "Container Docker su porta $port fermati"
    fi
  done
fi

###############################################################################
#  FASE 3 — INSTALLAZIONE DIPENDENZE
###############################################################################
banner "FASE 3 · INSTALLAZIONE DIPENDENZE"

sudo apt-get update -qq

# Pacchetti base
PACKAGES=(
  build-essential curl wget git unzip jq
  ca-certificates gnupg lsb-release
  python3 python3-pip python3-venv
  ufw fail2ban htop
)

info "Installazione pacchetti di sistema..."
sudo apt-get install -y -qq "${PACKAGES[@]}" 2>/dev/null
step "Pacchetti base installati"

# ── Node.js 20 (via nvm) ───────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  info "Installazione Node.js 20 via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  nvm alias default 20
  step "Node.js $(node -v) installato"
else
  step "Node.js $(node -v) già presente"
fi

# Assicurati che nvm sia caricato
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# ── pnpm ────────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
  step "pnpm installato"
else
  step "pnpm $(pnpm --version) già presente"
fi

# ── Docker ──────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installazione Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  step "Docker installato (richiede logout/login per il gruppo)"
else
  step "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') già presente"
fi

# ── Supabase CLI ────────────────────────────────────────────────────────────
if ! command -v supabase &>/dev/null; then
  info "Installazione Supabase CLI..."
  curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh
  step "Supabase CLI installato"
else
  step "Supabase CLI $(supabase --version 2>/dev/null || echo 'ok') già presente"
fi

# ── Claude Code ─────────────────────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  info "Installazione Claude Code..."
  npm install -g @anthropic-ai/claude-code
  step "Claude Code installato"
else
  step "Claude Code già presente"
fi

###############################################################################
#  FASE 4 — STRUTTURA PROGETTO
###############################################################################
banner "FASE 4 · STRUTTURA PROGETTO NEXUS PRO"

mkdir -p "$NEXUS_HOME"
cd "$NEXUS_HOME"

# Directory tree completo
DIRS=(
  # Core
  "src/app/(auth)/login"
  "src/app/(auth)/register"
  "src/app/(dashboard)/dashboard"
  "src/app/(dashboard)/analysis"
  "src/app/(dashboard)/backtest"
  "src/app/(dashboard)/trades"
  "src/app/(dashboard)/portfolio"
  "src/app/(dashboard)/settings"
  "src/app/api/health"
  "src/app/api/signals"
  "src/app/api/trades"
  "src/app/api/backtest"
  "src/app/api/market-data"
  "src/app/api/webhooks/broker"
  "src/app/api/cron/cleanup"
  "src/app/api/cron/signals"
  # Components
  "src/components/ui"
  "src/components/charts"
  "src/components/dashboard"
  "src/components/trading"
  "src/components/layout"
  # Engine
  "src/lib/engine/indicators"
  "src/lib/engine/patterns"
  "src/lib/engine/strategies"
  "src/lib/engine/backtest"
  "src/lib/engine/risk"
  "src/lib/engine/signals"
  # Broker integrations
  "src/lib/broker/binance"
  "src/lib/broker/alpaca"
  "src/lib/broker/paper"
  # Data
  "src/lib/data/providers"
  "src/lib/data/cache"
  "src/lib/data/streams"
  # Core lib
  "src/lib/auth"
  "src/lib/db"
  "src/lib/store"
  "src/lib/utils"
  "src/lib/crypto"
  "src/lib/logger"
  "src/lib/validation"
  # Workers (background jobs)
  "src/workers/signal-scanner"
  "src/workers/data-fetcher"
  "src/workers/alert-dispatcher"
  "src/workers/portfolio-sync"
  # Hooks & Types
  "src/hooks"
  "src/types"
  # Supabase
  "supabase/migrations"
  "supabase/functions/process-signal"
  "supabase/functions/send-alert"
  "supabase/seed"
  # OpenClaw agents
  "agents/trading-analyst"
  "agents/risk-manager"
  "agents/market-scanner"
  "agents/report-generator"
  "agents/config"
  # Docker
  "docker/nginx"
  "docker/workers"
  # Tests
  "tests/unit/engine"
  "tests/unit/strategies"
  "tests/integration/broker"
  "tests/integration/api"
  "tests/e2e"
  # CI/CD
  ".github/workflows"
  # Scripts
  "scripts"
  # Docs
  "docs/adr"
  "docs/api"
  "docs/guides"
  # Public
  "public/icons"
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
done

step "Struttura directory creata (${#DIRS[@]} cartelle)"

###############################################################################
#  FASE 4b — FILE DI CONFIGURAZIONE
###############################################################################
info "Creazione file di configurazione..."

# ── package.json ────────────────────────────────────────────────────────────
cat > package.json << 'PKGJSON'
{
  "name": "nexus-pro",
  "version": "5.0.0",
  "private": true,
  "description": "Nexus Pro — Trading Analytics & Simulation Platform",
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "lint": "next lint && tsc --noEmit",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "db:migrate": "supabase db push",
    "db:reset": "supabase db reset",
    "db:seed": "tsx supabase/seed/index.ts",
    "db:types": "supabase gen types typescript --local > src/types/database.ts",
    "docker:dev": "docker compose -f docker/docker-compose.dev.yml up -d",
    "docker:prod": "docker compose -f docker/docker-compose.prod.yml up -d",
    "docker:down": "docker compose -f docker/docker-compose.dev.yml down",
    "workers:start": "tsx src/workers/index.ts",
    "agents:start": "node agents/config/runner.js",
    "precommit": "pnpm lint && pnpm test",
    "prepare": "husky"
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
    "node-cron": "^3.0.0",
    "ws": "^8.17.0",
    "lucide-react": "^0.400.0",
    "tailwind-merge": "^2.4.0",
    "clsx": "^2.1.0",
    "class-variance-authority": "^0.7.0",
    "framer-motion": "^11.3.0",
    "sonner": "^1.5.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-switch": "^1.1.0",
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
    "@vitest/ui": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "tsx": "^4.16.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "prettier": "^3.3.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.2.0"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
PKGJSON

# ── tsconfig.json ───────────────────────────────────────────────────────────
cat > tsconfig.json << 'TSCONFIG'
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
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/types/*": ["./src/types/*"],
      "@/agents/*": ["./agents/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
TSCONFIG

# ── next.config.mjs ────────────────────────────────────────────────────────
cat > next.config.mjs << 'NEXTCONFIG'
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.coingecko.com https://api.polygon.io https://api.binance.com wss://stream.binance.com",
          ].join('; '),
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ],
    },
  ],
};

export default nextConfig;
NEXTCONFIG

# ── tailwind.config.ts ─────────────────────────────────────────────────────
cat > tailwind.config.ts << 'TAILWIND'
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg:       "#0a0e17",
          surface:  "#111827",
          border:   "#1e293b",
          accent:   "#06b6d4",     // cyan-500
          profit:   "#22c55e",     // green-500
          loss:     "#ef4444",     // red-500
          warning:  "#f59e0b",     // amber-500
          neutral:  "#94a3b8",     // slate-400
          text:     "#f1f5f9",     // slate-100
          muted:    "#64748b",     // slate-500
        },
      },
      fontFamily: {
        sans:  ["JetBrains Mono", "Fira Code", "monospace"],
        mono:  ["JetBrains Mono", "monospace"],
        display: ["Space Grotesk", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "glow":       "glow 2s ease-in-out infinite alternate",
        "slide-up":   "slideUp 0.3s ease-out",
      },
      keyframes: {
        glow: {
          "0%":   { boxShadow: "0 0 5px rgba(6, 182, 212, 0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(6, 182, 212, 0.6)" },
        },
        slideUp: {
          "0%":   { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
TAILWIND

# ── postcss.config.js ──────────────────────────────────────────────────────
cat > postcss.config.js << 'POSTCSS'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
POSTCSS

# ── .env.local (template) ──────────────────────────────────────────────────
cat > .env.local.template << 'ENVTEMPLATE'
# ╔═══════════════════════════════════════════════════╗
# ║  NEXUS PRO v5 — CONFIGURAZIONE AMBIENTE          ║
# ╠═══════════════════════════════════════════════════╣
# ║  Copia come .env.local e compila i valori        ║
# ╚═══════════════════════════════════════════════════╝

# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── App ──
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=genera-con-openssl-rand-hex-32
NODE_ENV=development

# ── Market Data Providers ──
POLYGON_API_KEY=
COINGECKO_API_KEY=
ALPHA_VANTAGE_KEY=

# ── Broker (Paper Trading prima!) ──
BINANCE_API_KEY=
BINANCE_SECRET_KEY=
BINANCE_TESTNET=true
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPACA_PAPER=true

# ── Redis (per job queue e cache) ──
REDIS_URL=redis://localhost:6379

# ── Encryption ──
ENCRYPTION_KEY=genera-con-openssl-rand-hex-32

# ── OpenClaw (agente AI locale) ──
OPENCLAW_ENDPOINT=http://localhost:8800
OPENCLAW_MODEL=default
OPENCLAW_ENABLED=true

# ── Alerts ──
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
ENVTEMPLATE

if [ ! -f .env.local ]; then
  cp .env.local.template .env.local
  info "Creato .env.local — compilalo con le tue chiavi"
fi

# ── .gitignore ──────────────────────────────────────────────────────────────
cat > .gitignore << 'GITIGNORE'
# deps
node_modules/
.pnpm-store/

# next
.next/
out/

# env
.env
.env.local
.env.*.local

# system
.DS_Store
*.log
*.pid

# editor
.vscode/settings.json
.idea/

# test
coverage/

# docker volumes
docker/data/

# build
dist/
build/

# supabase local
supabase/.temp/
GITIGNORE

# ── prettier / eslint ──────────────────────────────────────────────────────
cat > .prettierrc << 'PRETTIER'
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always"
}
PRETTIER

cat > .eslintrc.json << 'ESLINT'
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
ESLINT

# ── vitest.config.ts ───────────────────────────────────────────────────────
cat > vitest.config.ts << 'VITEST'
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/engine/**'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
VITEST

step "File di configurazione creati"

###############################################################################
#  FASE 5 — DATABASE SUPABASE (MIGRATIONS)
###############################################################################
banner "FASE 5 · DATABASE SCHEMA"

# ── supabase/config.toml ───────────────────────────────────────────────────
cat > supabase/config.toml << 'SUPACONFIG'
[project]
id = "nexus-pro"

[api]
port = 54321
schemas = ["public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
major_version = 15

[studio]
port = 54323
SUPACONFIG

# ── Migration 001: Enum types ──────────────────────────────────────────────
cat > supabase/migrations/001_types.sql << 'SQL001'
-- Nexus Pro v5 — Tipi base
CREATE TYPE trade_side AS ENUM ('buy', 'sell');
CREATE TYPE trade_status AS ENUM ('open', 'closed', 'cancelled');
CREATE TYPE close_reason AS ENUM (
  'stop_loss', 'take_profit', 'trailing_stop',
  'signal', 'manual', 'timeout', 'margin_call'
);
CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE timeframe AS ENUM ('1m','5m','15m','1h','4h','1d','1w');
CREATE TYPE signal_strength AS ENUM ('strong_buy','buy','neutral','sell','strong_sell');
CREATE TYPE alert_channel AS ENUM ('push', 'email', 'telegram', 'sms');
CREATE TYPE alert_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE broker_name AS ENUM ('paper', 'binance', 'alpaca', 'interactive_brokers');
CREATE TYPE market_regime AS ENUM ('bull', 'bear', 'high_vol', 'low_vol', 'sideways');
SQL001

# ── Migration 002: Core tables ─────────────────────────────────────────────
cat > supabase/migrations/002_tables.sql << 'SQL002'
-- Nexus Pro v5 — Tabelle principali

-- Profili utente
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  preferred_currency TEXT DEFAULT 'USD',
  timezone TEXT DEFAULT 'Europe/Rome',
  risk_tolerance SMALLINT DEFAULT 5 CHECK (risk_tolerance BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Connessioni broker
CREATE TABLE broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker broker_name NOT NULL,
  api_key_encrypted TEXT,
  secret_key_encrypted TEXT,
  is_paper BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, broker)
);

-- Configurazioni trading
CREATE TABLE trading_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  initial_capital NUMERIC(18,2) DEFAULT 10000,
  risk_per_trade NUMERIC(5,4) DEFAULT 0.02,
  max_open_trades SMALLINT DEFAULT 5,
  default_stop_loss NUMERIC(5,4) DEFAULT 0.03,
  default_take_profit NUMERIC(5,4) DEFAULT 0.06,
  use_trailing_stop BOOLEAN DEFAULT true,
  trailing_stop_pct NUMERIC(5,4) DEFAULT 0.02,
  use_kelly BOOLEAN DEFAULT true,
  kelly_fraction NUMERIC(3,2) DEFAULT 0.25,
  commission_pct NUMERIC(6,5) DEFAULT 0.001,
  slippage_pct NUMERIC(6,5) DEFAULT 0.0005,
  cooldown_minutes INTEGER DEFAULT 60,
  allowed_assets TEXT[] DEFAULT '{}',
  allowed_strategies TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Risultati backtest
CREATE TABLE backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  config_id UUID REFERENCES trading_configs(id),
  asset TEXT NOT NULL,
  strategy TEXT NOT NULL,
  timeframe timeframe DEFAULT '1d',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  initial_capital NUMERIC(18,2),
  final_capital NUMERIC(18,2),
  total_return NUMERIC(8,4),
  sharpe_ratio NUMERIC(6,3),
  sortino_ratio NUMERIC(6,3),
  max_drawdown NUMERIC(6,4),
  win_rate NUMERIC(5,4),
  profit_factor NUMERIC(6,3),
  total_trades INTEGER,
  avg_trade_pnl NUMERIC(18,2),
  avg_hold_time INTERVAL,
  monte_carlo_prob NUMERIC(5,4),
  monte_carlo_p5 NUMERIC(8,4),
  monte_carlo_p50 NUMERIC(8,4),
  monte_carlo_p95 NUMERIC(8,4),
  walk_forward_score NUMERIC(5,4),
  regime_detected market_regime,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trade (simulati e reali)
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  backtest_id UUID REFERENCES backtest_results(id) ON DELETE CASCADE,
  broker_connection_id UUID REFERENCES broker_connections(id),
  asset TEXT NOT NULL,
  side trade_side NOT NULL,
  status trade_status DEFAULT 'open',
  order_type order_type DEFAULT 'market',
  entry_price NUMERIC(18,8) NOT NULL,
  exit_price NUMERIC(18,8),
  quantity NUMERIC(18,8) NOT NULL,
  stop_loss NUMERIC(18,8),
  take_profit NUMERIC(18,8),
  trailing_stop_pct NUMERIC(5,4),
  commission NUMERIC(18,8) DEFAULT 0,
  slippage NUMERIC(18,8) DEFAULT 0,
  pnl NUMERIC(18,8),
  pnl_pct NUMERIC(8,4),
  close_reason close_reason,
  signal_data JSONB DEFAULT '{}',
  is_paper BOOLEAN DEFAULT true,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Watchlist
CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Main',
  assets TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Alert
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value JSONB NOT NULL,
  channel alert_channel DEFAULT 'push',
  status alert_status DEFAULT 'pending',
  message TEXT,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cache dati di mercato
CREATE TABLE market_data_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  timeframe timeframe NOT NULL,
  data_date DATE NOT NULL,
  ohlcv JSONB NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset, timeframe, data_date)
);

-- Log segnali
CREATE TABLE signal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  asset TEXT NOT NULL,
  strategy TEXT NOT NULL,
  timeframe timeframe DEFAULT '1d',
  signal signal_strength NOT NULL,
  confidence NUMERIC(5,4),
  indicators JSONB NOT NULL,
  regime market_regime,
  acted_on BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
SQL002

# ── Migration 003: RLS + Indexes ───────────────────────────────────────────
cat > supabase/migrations/003_security.sql << 'SQL003'
-- Nexus Pro v5 — Row-Level Security & Indexes

-- Abilita RLS su tutte le tabelle
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

-- Policy: ogni utente vede/modifica solo i suoi dati
CREATE POLICY "users_own_data" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "users_own_data" ON broker_connections
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_data" ON trading_configs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_data" ON backtest_results
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_data" ON trades
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_data" ON watchlists
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_data" ON alerts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_data" ON signal_log
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_data" ON audit_log
  FOR ALL USING (auth.uid() = user_id);

-- Market data è leggibile da tutti gli utenti autenticati
CREATE POLICY "authenticated_read" ON market_data_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- Indexes per performance
CREATE INDEX idx_trades_user_asset ON trades(user_id, asset);
CREATE INDEX idx_trades_status ON trades(status) WHERE status = 'open';
CREATE INDEX idx_trades_opened ON trades(opened_at DESC);
CREATE INDEX idx_backtest_user ON backtest_results(user_id, created_at DESC);
CREATE INDEX idx_backtest_asset_strategy ON backtest_results(asset, strategy);
CREATE INDEX idx_signals_user_asset ON signal_log(user_id, asset, created_at DESC);
CREATE INDEX idx_signals_created ON signal_log(created_at DESC);
CREATE INDEX idx_alerts_user_pending ON alerts(user_id) WHERE status = 'pending';
CREATE INDEX idx_market_cache_lookup ON market_data_cache(asset, timeframe, data_date DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
SQL003

# ── Migration 004: Functions & Triggers ─────────────────────────────────────
cat > supabase/migrations/004_functions.sql << 'SQL004'
-- Nexus Pro v5 — Functions, Triggers, Cron Jobs

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER tr_configs_updated
  BEFORE UPDATE ON trading_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Audit log per trade live (non paper)
CREATE OR REPLACE FUNCTION audit_live_trade()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT NEW.is_paper THEN
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      NEW.user_id,
      CASE WHEN TG_OP = 'INSERT' THEN 'trade_opened'
           WHEN TG_OP = 'UPDATE' AND NEW.status = 'closed' THEN 'trade_closed'
           ELSE 'trade_updated' END,
      'trade',
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb ELSE NULL END,
      row_to_json(NEW)::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_audit_trade
  AFTER INSERT OR UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION audit_live_trade();

-- Vista: portfolio summary
CREATE OR REPLACE VIEW portfolio_summary AS
SELECT
  user_id,
  asset,
  COUNT(*) FILTER (WHERE status = 'open') AS open_trades,
  COUNT(*) FILTER (WHERE status = 'closed') AS closed_trades,
  SUM(pnl) FILTER (WHERE status = 'closed') AS total_pnl,
  AVG(pnl_pct) FILTER (WHERE status = 'closed') AS avg_pnl_pct,
  COUNT(*) FILTER (WHERE pnl > 0 AND status = 'closed') AS winning_trades,
  COUNT(*) FILTER (WHERE pnl <= 0 AND status = 'closed') AS losing_trades,
  MAX(closed_at) AS last_trade_at
FROM trades
GROUP BY user_id, asset;

-- Rate limiting function
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_per_hour INTEGER DEFAULT 100
) RETURNS BOOLEAN AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM audit_log
  WHERE user_id = p_user_id
    AND action = p_action
    AND created_at > now() - INTERVAL '1 hour';

  RETURN recent_count < p_max_per_hour;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function (da chiamare via cron)
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Rimuovi cache vecchia di 7 giorni
  DELETE FROM market_data_cache WHERE fetched_at < now() - INTERVAL '7 days';
  -- Rimuovi signal log vecchio di 90 giorni
  DELETE FROM signal_log WHERE created_at < now() - INTERVAL '90 days';
  -- Rimuovi audit log vecchio di 1 anno
  DELETE FROM audit_log WHERE created_at < now() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
SQL004

step "4 migration files creati"

###############################################################################
#  FASE 6 — DOCKER
###############################################################################
banner "FASE 6 · DOCKER CONFIGURATION"

# ── docker-compose.dev.yml ──────────────────────────────────────────────────
cat > docker/docker-compose.dev.yml << 'DOCKERDEV'
version: "3.9"
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  redis_data:
DOCKERDEV

# ── docker-compose.prod.yml ────────────────────────────────────────────────
cat > docker/docker-compose.prod.yml << 'DOCKERPROD'
version: "3.9"
services:
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ../.env.local
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "1.0"

  workers:
    build:
      context: ..
      dockerfile: docker/workers/Dockerfile
    env_file:
      - ../.env.local
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.5"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  redis_data:
DOCKERPROD

# ── Dockerfile ──────────────────────────────────────────────────────────────
cat > docker/Dockerfile << 'DOCKERFILE'
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nexus && \
    adduser --system --uid 1001 nexus
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nexus
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
DOCKERFILE

# ── Nginx config ────────────────────────────────────────────────────────────
cat > docker/nginx/nginx.conf << 'NGINX'
events { worker_connections 1024; }

http {
  upstream nexus_app { server app:3000; }

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
  limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

  server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API rate limit
    location /api/ {
      limit_req zone=api burst=20 nodelay;
      proxy_pass http://nexus_app;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Auth rate limit (più restrittivo)
    location /api/auth/ {
      limit_req zone=auth burst=3 nodelay;
      proxy_pass http://nexus_app;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket per dati real-time
    location /ws/ {
      proxy_pass http://nexus_app;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 86400;
    }

    # App
    location / {
      proxy_pass http://nexus_app;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
}
NGINX

step "Docker configuration completa"

###############################################################################
#  FASE 7 — CI/CD (GITHUB ACTIONS)
###############################################################################
banner "FASE 7 · CI/CD"

cat > .github/workflows/ci.yml << 'CICD'
name: Nexus Pro CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test

  build:
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: .next/

  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - run: echo "Deploy to staging — configura Vercel/Railway qui"

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: echo "Deploy to production — configura Vercel/Railway qui"
CICD

step "CI/CD pipeline configurata"

###############################################################################
#  FASE 8 — OPENCLAW INTEGRATION
###############################################################################
banner "FASE 8 · OPENCLAW AGENTS"

# ── Agent: Trading Analyst ──────────────────────────────────────────────────
cat > agents/trading-analyst/agent.json << 'AGENT1'
{
  "name": "nexus-trading-analyst",
  "description": "Analizza dati di mercato, identifica pattern e genera segnali di trading",
  "version": "1.0.0",
  "tasks": [
    {
      "id": "analyze_asset",
      "description": "Analisi tecnica completa di un asset",
      "input": { "asset": "string", "timeframe": "string" },
      "steps": [
        "Recupera dati OHLCV recenti",
        "Calcola RSI, MACD, Bollinger, ADX, Stochastic",
        "Identifica pattern candlestick",
        "Determina regime di mercato (bull/bear/sideways)",
        "Genera segnale composito con confidence score",
        "Confronta con storico segnali per validazione"
      ]
    },
    {
      "id": "scan_opportunities",
      "description": "Scansiona tutti gli asset della watchlist per opportunità",
      "input": { "watchlist": "string[]" },
      "steps": [
        "Per ogni asset: esegui analyze_asset",
        "Filtra segnali con confidence > 70%",
        "Ordina per rapporto rischio/rendimento",
        "Genera report sintetico"
      ]
    }
  ]
}
AGENT1

# ── Agent: Risk Manager ────────────────────────────────────────────────────
cat > agents/risk-manager/agent.json << 'AGENT2'
{
  "name": "nexus-risk-manager",
  "description": "Monitora e gestisce il rischio del portfolio",
  "version": "1.0.0",
  "tasks": [
    {
      "id": "check_portfolio_risk",
      "description": "Valuta il rischio complessivo del portfolio",
      "input": { "user_id": "string" },
      "steps": [
        "Recupera posizioni aperte",
        "Calcola esposizione per asset e per settore",
        "Verifica correlazioni tra posizioni",
        "Calcola VaR (Value at Risk) giornaliero",
        "Controlla limiti di rischio configurati",
        "Genera alert se limiti superati"
      ]
    },
    {
      "id": "size_position",
      "description": "Calcola dimensione ottimale della posizione",
      "input": { "asset": "string", "signal_confidence": "number" },
      "steps": [
        "Recupera configurazione rischio utente",
        "Calcola volatilità recente (ATR)",
        "Applica Kelly Criterion con fractional Kelly",
        "Verifica margine disponibile",
        "Restituisci size e livelli stop/take profit"
      ]
    }
  ]
}
AGENT2

# ── Agent: Market Scanner ──────────────────────────────────────────────────
cat > agents/market-scanner/agent.json << 'AGENT3'
{
  "name": "nexus-market-scanner",
  "description": "Scansione continua del mercato per eventi significativi",
  "version": "1.0.0",
  "tasks": [
    {
      "id": "scan_breakouts",
      "description": "Identifica breakout di prezzo e volume",
      "input": { "assets": "string[]" },
      "steps": [
        "Monitora livelli di supporto/resistenza",
        "Rileva breakout con conferma volume",
        "Classifica per probabilità di successo",
        "Invia alert per i più promettenti"
      ]
    },
    {
      "id": "detect_regime_change",
      "description": "Rileva cambiamenti nel regime di mercato",
      "input": {},
      "steps": [
        "Analizza VIX e indici di volatilità",
        "Confronta correlazioni inter-asset",
        "Identifica shift da bull a bear o viceversa",
        "Aggiorna parametri di strategia di conseguenza"
      ]
    }
  ]
}
AGENT3

# ── Agent: Report Generator ────────────────────────────────────────────────
cat > agents/report-generator/agent.json << 'AGENT4'
{
  "name": "nexus-report-generator",
  "description": "Genera report periodici su performance e analisi",
  "version": "1.0.0",
  "tasks": [
    {
      "id": "daily_report",
      "description": "Report giornaliero di performance",
      "input": { "user_id": "string" },
      "steps": [
        "Recupera tutte le operazioni del giorno",
        "Calcola P/L giornaliero per asset",
        "Confronta con benchmark (S&P 500, BTC)",
        "Identifica trade migliori/peggiori",
        "Genera sommario con grafici",
        "Invia via canale preferito (email/telegram)"
      ]
    }
  ]
}
AGENT4

# ── Agent Runner Configuration ──────────────────────────────────────────────
cat > agents/config/runner.js << 'AGENTRUNNER'
/**
 * Nexus Pro — OpenClaw Agent Runner
 *
 * Questo file configura e avvia gli agenti OpenClaw.
 * Se OpenClaw non è disponibile, gli agenti funzionano come
 * moduli Node.js standalone con la stessa logica.
 */

const path = require('path');
const fs = require('fs');

const AGENTS_DIR = path.resolve(__dirname, '..');
const OPENCLAW_ENDPOINT = process.env.OPENCLAW_ENDPOINT || 'http://localhost:8800';
const OPENCLAW_ENABLED = process.env.OPENCLAW_ENABLED === 'true';

// Carica definizioni agenti
function loadAgents() {
  const agents = [];
  const dirs = fs.readdirSync(AGENTS_DIR).filter(d => {
    const agentFile = path.join(AGENTS_DIR, d, 'agent.json');
    return fs.existsSync(agentFile);
  });

  for (const dir of dirs) {
    const agentPath = path.join(AGENTS_DIR, dir, 'agent.json');
    const agent = JSON.parse(fs.readFileSync(agentPath, 'utf8'));
    agents.push({ ...agent, dir });
  }

  return agents;
}

async function registerWithOpenClaw(agents) {
  console.log(`🔗 Connessione a OpenClaw: ${OPENCLAW_ENDPOINT}`);

  for (const agent of agents) {
    try {
      const res = await fetch(`${OPENCLAW_ENDPOINT}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });

      if (res.ok) {
        console.log(`  ✓ ${agent.name} registrato`);
      } else {
        console.warn(`  ⚠ ${agent.name}: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error(`  ✗ ${agent.name}: ${err.message}`);
    }
  }
}

function runStandalone(agents) {
  console.log('📦 Modalità standalone (OpenClaw non disponibile)');
  console.log(`   ${agents.length} agenti caricati come moduli locali`);

  for (const agent of agents) {
    console.log(`  → ${agent.name}: ${agent.tasks.length} tasks disponibili`);
  }

  console.log('\n💡 Per attivare OpenClaw:');
  console.log('   1. Avvia OpenClaw: openclaw serve');
  console.log('   2. Imposta OPENCLAW_ENABLED=true in .env.local');
  console.log('   3. Rilancia: pnpm agents:start');
}

async function main() {
  console.log('\n═══ NEXUS PRO — Agent System ═══\n');

  const agents = loadAgents();
  console.log(`Trovati ${agents.length} agenti:\n`);

  for (const a of agents) {
    console.log(`  📋 ${a.name} v${a.version}`);
    console.log(`     ${a.description}`);
    console.log(`     Tasks: ${a.tasks.map(t => t.id).join(', ')}\n`);
  }

  if (OPENCLAW_ENABLED) {
    await registerWithOpenClaw(agents);
  } else {
    runStandalone(agents);
  }
}

main().catch(console.error);
AGENTRUNNER

step "4 agenti OpenClaw configurati"

###############################################################################
#  FASE 9 — SOURCE FILES INIZIALI
###############################################################################
banner "FASE 9 · SOURCE FILES"

# ── Supabase client ─────────────────────────────────────────────────────────
cat > src/lib/db/supabase.ts << 'SUPA_CLIENT'
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
SUPA_CLIENT

cat > src/lib/db/server.ts << 'SUPA_SERVER'
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
SUPA_SERVER

# ── Zustand store ───────────────────────────────────────────────────────────
cat > src/lib/store/index.ts << 'STORE'
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NexusState {
  // UI
  selectedAsset: string;
  selectedStrategy: string;
  selectedTimeframe: string;
  sidebarOpen: boolean;

  // Actions
  setAsset: (asset: string) => void;
  setStrategy: (strategy: string) => void;
  setTimeframe: (tf: string) => void;
  toggleSidebar: () => void;
}

export const useNexusStore = create<NexusState>()(
  persist(
    (set) => ({
      selectedAsset: 'BTC',
      selectedStrategy: 'adaptive_momentum',
      selectedTimeframe: '1d',
      sidebarOpen: true,

      setAsset: (asset) => set({ selectedAsset: asset }),
      setStrategy: (strategy) => set({ selectedStrategy: strategy }),
      setTimeframe: (tf) => set({ selectedTimeframe: tf }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: 'nexus-store' }
  )
);
STORE

# ── Logger ──────────────────────────────────────────────────────────────────
cat > src/lib/logger/index.ts << 'LOGGER'
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
LOGGER

# ── Types ───────────────────────────────────────────────────────────────────
cat > src/types/trading.ts << 'TYPES'
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  asset: string;
  strategy: string;
  strength: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confidence: number;
  indicators: Record<string, number | string>;
  regime: 'bull' | 'bear' | 'high_vol' | 'low_vol' | 'sideways';
  timestamp: number;
}

export interface Trade {
  id: string;
  asset: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  trailingStopPct?: number;
  pnl?: number;
  pnlPct?: number;
  closeReason?: string;
  isPaper: boolean;
  openedAt: Date;
  closedAt?: Date;
}

export interface BacktestConfig {
  asset: string;
  strategy: string;
  timeframe: string;
  initialCapital: number;
  riskPerTrade: number;
  stopLossPct: number;
  takeProfitPct: number;
  useTrailingStop: boolean;
  trailingStopPct: number;
  useKelly: boolean;
  kellyFraction: number;
  commissionPct: number;
  slippagePct: number;
  periodDays: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: Trade[];
  finalCapital: number;
  totalReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  avgTradePnl: number;
  monteCarlo: {
    simulations: number;
    profitProbability: number;
    percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  };
  walkForward: {
    windows: number;
    avgReturn: number;
    robustnessScore: number;
  };
}

export interface BrokerConfig {
  name: 'paper' | 'binance' | 'alpaca';
  apiKey?: string;
  secretKey?: string;
  isPaper: boolean;
  baseUrl: string;
}

export type MarketRegime = 'bull' | 'bear' | 'high_vol' | 'low_vol' | 'sideways';
TYPES

# ── API Health endpoint ─────────────────────────────────────────────────────
cat > src/app/api/health/route.ts << 'HEALTH'
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '5.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
  });
}
HEALTH

# ── Root layout ─────────────────────────────────────────────────────────────
cat > src/app/layout.tsx << 'LAYOUT'
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus Pro | Trading Analytics',
  description: 'Advanced trading analytics and simulation platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-nexus-bg text-nexus-text font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
LAYOUT

# ── Global CSS ──────────────────────────────────────────────────────────────
cat > src/app/globals.css << 'GLOBALCSS'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --nexus-bg: #0a0e17;
  --nexus-surface: #111827;
  --nexus-accent: #06b6d4;
  --nexus-profit: #22c55e;
  --nexus-loss: #ef4444;
}

body {
  background: var(--nexus-bg);
  overflow-x: hidden;
}

/* Scrollbar custom */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--nexus-bg); }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }

/* Glow effects */
.glow-cyan { box-shadow: 0 0 15px rgba(6, 182, 212, 0.3); }
.glow-green { box-shadow: 0 0 15px rgba(34, 197, 94, 0.3); }
.glow-red { box-shadow: 0 0 15px rgba(239, 68, 68, 0.3); }
GLOBALCSS

# ── Landing page ────────────────────────────────────────────────────────────
cat > src/app/page.tsx << 'HOMEPAGE'
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold font-display tracking-tight">
          <span className="text-nexus-accent">NEXUS</span> PRO
        </h1>
        <p className="text-nexus-muted text-lg max-w-md mx-auto">
          Trading Analytics &amp; Simulation Platform
        </p>
        <div className="text-sm text-nexus-muted/50 font-mono">
          v5.0.0 · Sistema attivo
        </div>
      </div>
    </main>
  );
}
HOMEPAGE

step "Source files iniziali creati"

###############################################################################
#  FASE 10 — SCRIPTS DI UTILITÀ
###############################################################################
banner "FASE 10 · SCRIPTS"

# ── Dev start ───────────────────────────────────────────────────────────────
cat > scripts/dev-start.sh << 'DEVSTART'
#!/usr/bin/env bash
set -euo pipefail

echo "═══ NEXUS PRO — Avvio sviluppo ═══"

# 1. Libera porte
for port in 3000 3001 6379; do
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null && echo "Porta $port liberata"
done

# 2. Avvia Redis via Docker
echo "→ Avvio Redis..."
docker compose -f docker/docker-compose.dev.yml up -d

# 3. Aspetta Redis
echo "→ Attesa Redis..."
until docker exec $(docker ps -qf "ancestor=redis:7-alpine") redis-cli ping 2>/dev/null | grep -q PONG; do
  sleep 1
done
echo "  ✓ Redis pronto"

# 4. Avvia Next.js
echo "→ Avvio Next.js dev server..."
pnpm dev &
NEXT_PID=$!

# 5. Avvia agenti (se OpenClaw configurato)
if [ "${OPENCLAW_ENABLED:-false}" = "true" ]; then
  echo "→ Avvio agenti OpenClaw..."
  pnpm agents:start &
fi

echo ""
echo "═══════════════════════════════════"
echo "  Nexus Pro in esecuzione!"
echo "  App:   http://localhost:3000"
echo "  Redis: localhost:6379"
echo "═══════════════════════════════════"

wait $NEXT_PID
DEVSTART
chmod +x scripts/dev-start.sh

# ── Health check ────────────────────────────────────────────────────────────
cat > scripts/health-check.sh << 'HEALTHCHECK'
#!/usr/bin/env bash
echo "═══ NEXUS PRO — Health Check ═══"

# App
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "  ✓ App: OK"
  curl -s http://localhost:3000/api/health | jq .
else
  echo "  ✗ App: NON raggiungibile"
fi

# Redis
if redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "  ✓ Redis: OK"
else
  echo "  ✗ Redis: NON raggiungibile"
fi

# Docker
echo "  Docker containers:"
docker ps --format "    {{.Names}}: {{.Status}}" 2>/dev/null || echo "    Docker non attivo"

# Porte
echo "  Porte in uso:"
for port in 3000 3001 6379 54321; do
  pid=$(lsof -ti ":$port" 2>/dev/null || true)
  [ -n "$pid" ] && echo "    $port: PID $pid ($(ps -p $pid -o comm= 2>/dev/null))"
done
HEALTHCHECK
chmod +x scripts/health-check.sh

# ── Backup DB ───────────────────────────────────────────────────────────────
cat > scripts/backup-db.sh << 'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="$HOME/nexus-pro/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="nexus_backup_$TIMESTAMP.sql"

echo "═══ NEXUS PRO — Database Backup ═══"
echo "→ Esportazione in corso..."

# Usa supabase CLI per dump
supabase db dump -f "$BACKUP_DIR/$FILENAME" 2>/dev/null || {
  echo "⚠ Supabase CLI dump fallito, prova pg_dump diretto"
  pg_dump "$DATABASE_URL" > "$BACKUP_DIR/$FILENAME" 2>/dev/null || {
    echo "✗ Backup fallito. Verifica la connessione al database."
    exit 1
  }
}

# Comprimi
gzip "$BACKUP_DIR/$FILENAME"
echo "✓ Backup salvato: $BACKUP_DIR/$FILENAME.gz"
echo "  Dimensione: $(du -h "$BACKUP_DIR/$FILENAME.gz" | cut -f1)"

# Rimuovi backup vecchi di 30 giorni
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "  Backup >30gg rimossi"
BACKUP
chmod +x scripts/backup-db.sh

step "Scripts di utilità creati"

###############################################################################
#  FASE 11 — DOCUMENTAZIONE
###############################################################################
banner "FASE 11 · DOCUMENTAZIONE"

cat > README.md << 'README'
# NEXUS PRO v5.0

> Trading Analytics & Simulation Platform

## Quick Start

```bash
# 1. Installa dipendenze
pnpm install

# 2. Configura ambiente
cp .env.local.template .env.local
# Compila con le tue chiavi Supabase

# 3. Avvia
./scripts/dev-start.sh
```

## Struttura

```
nexus-pro/
├── src/
│   ├── app/          # Next.js pages & API routes
│   ├── components/   # UI components
│   ├── lib/
│   │   ├── engine/   # Trading engine (indicatori, pattern, strategie)
│   │   ├── broker/   # Integrazioni broker (Binance, Alpaca, Paper)
│   │   ├── data/     # Market data providers & cache
│   │   ├── db/       # Supabase client
│   │   └── store/    # Zustand state management
│   ├── workers/      # Background jobs (signals, alerts, data)
│   └── types/        # TypeScript types
├── agents/           # OpenClaw AI agents
├── supabase/         # Database migrations & functions
├── docker/           # Docker configs (dev, prod, nginx)
├── tests/            # Unit, integration, e2e tests
└── scripts/          # Utility scripts
```

## Sviluppo con Claude Code

```bash
claude
# Poi chiedi:
# "Implementa il calcolo RSI in src/lib/engine/indicators/"
# "Crea il componente grafico candlestick"
# "Aggiungi il paper trading engine"
```

## ⚠️ Disclaimer

Questo è un sistema di **simulazione e studio**. Non è consulenza finanziaria.
Il trading comporta rischi significativi di perdita del capitale.
README

# ── ADR: Architettura ──────────────────────────────────────────────────────
cat > docs/adr/001-architecture.md << 'ADR'
# ADR 001: Architettura del Sistema

## Contesto
Necessità di una piattaforma di trading analytics scalabile e sicura.

## Decisione
- **Frontend**: Next.js 14 (App Router) + Tailwind + Zustand
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Queue**: BullMQ + Redis per job asincroni
- **Deploy**: Docker + Nginx + CI/CD via GitHub Actions
- **AI Agents**: OpenClaw per task automatizzati

## Motivazioni
- Next.js: SSR + API routes in un unico progetto
- Supabase: BaaS con RLS nativo, riduce codice backend
- Redis/BullMQ: job queue robusto per signal scanning e alerting
- OpenClaw: agenti AI locali per analisi e report senza dipendenza cloud
ADR

step "Documentazione creata"

###############################################################################
#  FASE 12 — GIT INIT
###############################################################################
banner "FASE 12 · GIT INIT"

cd "$NEXUS_HOME"

if [ ! -d .git ]; then
  git init
  git add -A
  git commit -m "feat: initial setup — Nexus Pro v5.0.0

- Project structure with 40+ directories
- Next.js 14 + TypeScript + Tailwind
- Supabase schema (4 migrations, 10 tables, RLS)
- Docker dev + prod configurations
- CI/CD pipeline (GitHub Actions)
- 4 OpenClaw agents configured
- Utility scripts (dev, health, backup)
- Full documentation"
  step "Repository git inizializzato"
else
  step "Repository git già esistente"
fi

###############################################################################
#  RIEPILOGO FINALE
###############################################################################
banner "SETUP COMPLETO!"

echo -e "
${G}  ✓ Sistema diagnosticato${NC}
${G}  ✓ Progetti inventariati (vedi $ARCHIVE)${NC}
${G}  ✓ Porte 3000/3001 liberate${NC}
${G}  ✓ Dipendenze installate${NC}
${G}  ✓ Struttura progetto creata${NC}
${G}  ✓ Database schema pronto (4 migrations)${NC}
${G}  ✓ Docker configurato (dev + prod)${NC}
${G}  ✓ CI/CD pipeline pronta${NC}
${G}  ✓ 4 agenti OpenClaw configurati${NC}
${G}  ✓ Source files iniziali creati${NC}
${G}  ✓ Scripts di utilità pronti${NC}
${G}  ✓ Documentazione scritta${NC}
${G}  ✓ Git inizializzato${NC}

${W}PROSSIMI PASSI:${NC}

${C}  1.${NC} Chiudi e riapri il terminale (per caricare nvm)

${C}  2.${NC} Installa dipendenze Node:
     ${Y}cd ~/nexus-pro && pnpm install${NC}

${C}  3.${NC} Crea progetto Supabase:
     ${Y}→ https://supabase.com → New Project → nexus-pro${NC}
     ${Y}→ Copia URL e anon key in .env.local${NC}

${C}  4.${NC} Carica schema database:
     ${Y}supabase link --project-ref YOUR_PROJECT_REF${NC}
     ${Y}supabase db push${NC}

${C}  5.${NC} Avvia tutto:
     ${Y}./scripts/dev-start.sh${NC}

${C}  6.${NC} Apri Claude Code e inizia a sviluppare:
     ${Y}claude${NC}
     ${D}  → 'Implementa gli indicatori tecnici in src/lib/engine/indicators/'${NC}
     ${D}  → 'Crea il dashboard component con grafici candlestick'${NC}
     ${D}  → 'Configura il paper trading engine'${NC}
"

echo -e "${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${W}  Log completo: $LOG_FILE${NC}"
echo -e "${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
