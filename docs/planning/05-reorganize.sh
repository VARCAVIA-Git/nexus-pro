#!/usr/bin/env bash
# ============================================================================
# NEXUS PRO — REORGANIZE SCRIPT
# ----------------------------------------------------------------------------
# Riorganizza il repo allineandolo alla visione AI Analytic + Strategy.
# Idempotente: si può rilanciare senza danni. Preserva la git history.
#
# Uso:
#   cd ~/nexus-pro
#   git checkout -b chore/reorg-analytics
#   bash docs/planning/05-reorganize.sh
#   pnpm build && pnpm test
# ============================================================================

set -e

ROOT="$(pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/reorganize-$(date +%Y%m%d-%H%M%S).log"

log() {
  echo "$@" | tee -a "$LOG_FILE"
}

log "==> Nexus Pro reorganization starting at $(date)"
log "==> Repo root: $ROOT"
log ""

# Verifica di essere nella root del progetto
if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ]; then
  log "ERRORE: lo script va eseguito dalla root di nexus-pro (manca package.json o src/)"
  exit 1
fi

# Verifica branch git
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "==> Branch corrente: $CURRENT_BRANCH"
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  log "ATTENZIONE: sei su $CURRENT_BRANCH. Crea un branch dedicato:"
  log "  git checkout -b chore/reorg-analytics"
  log "Continuo comunque tra 5 secondi (Ctrl-C per annullare)..."
  sleep 5
fi

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

move_file() {
  local src="$1"
  local dst="$2"
  if [ -f "$ROOT/$src" ]; then
    mkdir -p "$(dirname "$ROOT/$dst")"
    if git mv "$ROOT/$src" "$ROOT/$dst" 2>/dev/null; then
      log "  ✓ git mv $src → $dst"
    else
      mv "$ROOT/$src" "$ROOT/$dst"
      log "  ✓ mv     $src → $dst"
    fi
  else
    log "  ⊘ skip (not found): $src"
  fi
}

move_dir() {
  local src="$1"
  local dst="$2"
  if [ -d "$ROOT/$src" ]; then
    mkdir -p "$(dirname "$ROOT/$dst")"
    if git mv "$ROOT/$src" "$ROOT/$dst" 2>/dev/null; then
      log "  ✓ git mv $src/ → $dst/"
    else
      mv "$ROOT/$src" "$ROOT/$dst"
      log "  ✓ mv     $src/ → $dst/"
    fi
  else
    log "  ⊘ skip (not found): $src/"
  fi
}

remove_empty_dir() {
  if [ -d "$ROOT/$1" ] && [ -z "$(ls -A "$ROOT/$1" 2>/dev/null)" ]; then
    rmdir "$ROOT/$1"
    log "  ✓ removed empty: $1"
  fi
}

# ----------------------------------------------------------------------------
# STEP 1 — Crea le nuove directory target
# ----------------------------------------------------------------------------
log ""
log "==> STEP 1: creo directory target"
mkdir -p "$ROOT/src/lib/analytics/perception"
mkdir -p "$ROOT/src/lib/analytics/cognition"
mkdir -p "$ROOT/src/lib/analytics/action"
mkdir -p "$ROOT/src/lib/research"
mkdir -p "$ROOT/src/lib/core"
mkdir -p "$ROOT/docs/architecture"
mkdir -p "$ROOT/docs/audits"
mkdir -p "$ROOT/scripts/setup"
mkdir -p "$ROOT/logs"
log "  ✓ directory create"

# ----------------------------------------------------------------------------
# STEP 2 — Sposta i file flat di src/lib/engine/ nella nuova struttura
# ----------------------------------------------------------------------------
log ""
log "==> STEP 2: sposto i file di src/lib/engine/"

# core/
move_file "src/lib/engine/indicators.ts"        "src/lib/core/indicators.ts"
move_file "src/lib/engine/patterns.ts"          "src/lib/core/patterns.ts"
move_file "src/lib/engine/data-generator.ts"    "src/lib/core/data-generator.ts"

# analytics/perception/
move_file "src/lib/engine/mtf-analysis.ts"      "src/lib/analytics/perception/mtf-analysis.ts"
move_file "src/lib/engine/mtf-data.ts"          "src/lib/analytics/perception/mtf-data.ts"
move_file "src/lib/engine/news-sentiment.ts"    "src/lib/analytics/perception/news-sentiment.ts"
move_file "src/lib/engine/economic-calendar.ts" "src/lib/analytics/perception/economic-calendar.ts"
move_file "src/lib/engine/regime-classifier.ts" "src/lib/analytics/perception/regime-classifier.ts"

# analytics/cognition/
move_file "src/lib/engine/master-signal.ts"     "src/lib/analytics/cognition/master-signal.ts"
move_file "src/lib/engine/strategies.ts"        "src/lib/analytics/cognition/strategies.ts"
move_file "src/lib/engine/signals.ts"           "src/lib/analytics/cognition/signals.ts"
move_file "src/lib/engine/smart-timing.ts"      "src/lib/analytics/cognition/smart-timing.ts"
move_file "src/lib/engine/trap-detector.ts"     "src/lib/analytics/cognition/trap-detector.ts"

# analytics/action/
move_file "src/lib/engine/risk.ts"              "src/lib/analytics/action/risk.ts"
move_file "src/lib/engine/position-manager.ts"  "src/lib/analytics/action/position-manager.ts"
move_file "src/lib/engine/live-runner.ts"       "src/lib/analytics/action/live-runner.ts"
move_file "src/lib/engine/notifications.ts"     "src/lib/analytics/action/notifications.ts"

# analytics/learning/  (intero modulo)
move_dir  "src/lib/engine/learning"             "src/lib/analytics/learning"

# research/
move_file "src/lib/engine/backtest.ts"          "src/lib/research/backtest.ts"
move_dir  "src/lib/engine/deep-mapping"         "src/lib/research/deep-mapping"
move_dir  "src/lib/engine/rnd"                  "src/lib/research/rnd"
move_dir  "src/lib/engine/backtester"           "src/lib/research/backtester"
move_dir  "src/lib/engine/bollinger-bot"        "src/lib/research/bollinger-bot"

# ----------------------------------------------------------------------------
# STEP 3 — Rimuovi le cartelle vuote di scaffolding morto
# ----------------------------------------------------------------------------
log ""
log "==> STEP 3: rimuovo cartelle vuote di scaffolding"
remove_empty_dir "src/lib/backtest"
remove_empty_dir "src/lib/indicators"
remove_empty_dir "src/lib/market-data"
remove_empty_dir "src/lib/patterns"
remove_empty_dir "src/lib/strategies"
remove_empty_dir "src/lib/validators"
remove_empty_dir "src/lib/engine"

# ----------------------------------------------------------------------------
# STEP 4 — Sposta documentazione a docs/
# ----------------------------------------------------------------------------
log ""
log "==> STEP 4: sposto documentazione"
move_file "CONTEXT.md"      "docs/context.md"
move_file "DEPLOY.md"       "docs/deploy.md"
move_file "REDIS-KEYS.md"   "docs/architecture/redis-keys.md"
move_file "AUDIT-REPORT.md" "docs/audits/audit-report.md"
move_file "DEEP-AUDIT.md"   "docs/audits/deep-audit.md"

# ----------------------------------------------------------------------------
# STEP 5 — Sposta script di setup
# ----------------------------------------------------------------------------
log ""
log "==> STEP 5: sposto script di setup"
move_file "nexus-master-build.sh" "scripts/setup/nexus-master-build.sh"
move_file "nexus-pro-init.sh"     "scripts/setup/nexus-pro-init.sh"
move_file "nexus-fix.sh"          "scripts/setup/nexus-fix.sh"

# ----------------------------------------------------------------------------
# STEP 6 — Sposta log a logs/ e aggiorna .gitignore
# ----------------------------------------------------------------------------
log ""
log "==> STEP 6: sposto log e aggiorno .gitignore"
move_file "nexus-bot.log" "logs/nexus-bot.log"
move_file "setup.log"     "logs/setup.log"
touch "$ROOT/logs/.gitkeep"

if ! grep -q "^logs/" "$ROOT/.gitignore" 2>/dev/null; then
  echo "" >> "$ROOT/.gitignore"
  echo "# Runtime logs" >> "$ROOT/.gitignore"
  echo "logs/*" >> "$ROOT/.gitignore"
  echo "!logs/.gitkeep" >> "$ROOT/.gitignore"
  log "  ✓ aggiunto logs/ a .gitignore"
fi

# ----------------------------------------------------------------------------
# STEP 7 — Aggiorna gli import nel codice (CRITICO)
# ----------------------------------------------------------------------------
log ""
log "==> STEP 7: aggiorno import paths in tutti i file .ts/.tsx"

# Pattern più lunghi/specifici PRIMA dei più corti.
# In particolare engine/backtester deve venire prima di engine/backtest.

find "$ROOT/src" "$ROOT/tests" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | while read -r file; do
  sed -i \
    -e 's|@/lib/engine/learning|@/lib/analytics/learning|g' \
    -e 's|@/lib/engine/deep-mapping|@/lib/research/deep-mapping|g' \
    -e 's|@/lib/engine/backtester|@/lib/research/backtester|g' \
    -e 's|@/lib/engine/bollinger-bot|@/lib/research/bollinger-bot|g' \
    -e 's|@/lib/engine/rnd|@/lib/research/rnd|g' \
    -e 's|@/lib/engine/master-signal|@/lib/analytics/cognition/master-signal|g' \
    -e 's|@/lib/engine/mtf-analysis|@/lib/analytics/perception/mtf-analysis|g' \
    -e 's|@/lib/engine/mtf-data|@/lib/analytics/perception/mtf-data|g' \
    -e 's|@/lib/engine/news-sentiment|@/lib/analytics/perception/news-sentiment|g' \
    -e 's|@/lib/engine/economic-calendar|@/lib/analytics/perception/economic-calendar|g' \
    -e 's|@/lib/engine/regime-classifier|@/lib/analytics/perception/regime-classifier|g' \
    -e 's|@/lib/engine/strategies|@/lib/analytics/cognition/strategies|g' \
    -e 's|@/lib/engine/smart-timing|@/lib/analytics/cognition/smart-timing|g' \
    -e 's|@/lib/engine/trap-detector|@/lib/analytics/cognition/trap-detector|g' \
    -e 's|@/lib/engine/signals|@/lib/analytics/cognition/signals|g' \
    -e 's|@/lib/engine/position-manager|@/lib/analytics/action/position-manager|g' \
    -e 's|@/lib/engine/live-runner|@/lib/analytics/action/live-runner|g' \
    -e 's|@/lib/engine/notifications|@/lib/analytics/action/notifications|g' \
    -e 's|@/lib/engine/risk|@/lib/analytics/action/risk|g' \
    -e 's|@/lib/engine/backtest|@/lib/research/backtest|g' \
    -e 's|@/lib/engine/indicators|@/lib/core/indicators|g' \
    -e 's|@/lib/engine/patterns|@/lib/core/patterns|g' \
    -e 's|@/lib/engine/data-generator|@/lib/core/data-generator|g' \
    "$file"
done
log "  ✓ import aggiornati"

# Verifica che non ci siano più riferimenti a @/lib/engine
REMAINING=$(grep -r "@/lib/engine" "$ROOT/src" "$ROOT/tests" 2>/dev/null | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  log "  ⚠ ATTENZIONE: $REMAINING riferimenti residui a @/lib/engine — controllare manualmente"
  grep -r "@/lib/engine" "$ROOT/src" "$ROOT/tests" 2>/dev/null | tee -a "$LOG_FILE"
else
  log "  ✓ zero riferimenti residui a @/lib/engine"
fi

# ----------------------------------------------------------------------------
# STEP 8 — Crea README placeholder nelle nuove cartelle
# ----------------------------------------------------------------------------
log ""
log "==> STEP 8: scrivo README placeholder"

cat > "$ROOT/src/lib/analytics/README.md" <<'EOF'
# analytics/

Il cervello unificato di Nexus Pro: ogni asset è gestito da un'`AssetAnalytic`
persistente che orchestra percezione, cognizione, azione e apprendimento.

- `asset-analytic.ts` — entità principale per asset (orchestratore)
- `analytic-registry.ts` — singleton: getAnalytic, listAnalytics, spawn
- `analytic-loop.ts` — osservazione live integrata nel cron tick
- `analytic-queue.ts` — coda Redis sequenziale per training pesanti
- `types.ts` — interfacce TypeScript condivise
- `perception/` — sensi: MTF, news, calendario, regime
- `cognition/` — cervello: master signal, strategie, smart timing
- `action/` — mani: risk, position manager, live runner, mine manager
- `learning/` — auto-miglioramento: outcome tracker, adaptive weights
EOF

cat > "$ROOT/src/lib/research/README.md" <<'EOF'
# research/

Tool offline di ricerca e sperimentazione. Quello che l'AI Analytic usa per
"studiare" il suo asset. Non si chiama mai dal tick loop runtime.

- `deep-mapping/` — pattern mining sistematico per asset
- `rnd/` — R&D Lab: data warehouse, indicator scanner, strategy trainer
- `backtester/` — backtest engine
- `bollinger-bot/` — modulo strategia Bollinger
- `backtest.ts` — utility legacy
EOF

cat > "$ROOT/src/lib/core/README.md" <<'EOF'
# core/

Primitive condivise da analytics/ e research/. Funzioni pure, nessuno stato.

- `indicators.ts` — RSI, MACD, BB, ATR, ADX, Stoch, EMA/SMA, Volume
- `patterns.ts` — 12 pattern candlestick
- `data-generator.ts` — generatore GBM per test
EOF

cat > "$ROOT/scripts/README.md" <<'EOF'
# scripts/

- `setup/` — script di provisioning una tantum
- `dev-start.sh` — avvio ambiente dev locale
- `start-bot.sh`, `start-production.sh`, `stop.sh` — gestione PM2 server
- `setup-tunnel.sh` — tunnel ssh per dev remoto
- `backup/` — backup database
- `deploy/` — pre-deploy check, firewall, ssl
- `monitoring/` — health check
- `reorganize.sh` — script di riorganizzazione (storico, non rilanciare)
EOF

cat > "$ROOT/docs/README.md" <<'EOF'
# docs/

- `vision.md` — visione del prodotto (LEGGI PER PRIMA)
- `context.md` — contesto tecnico storico
- `deploy.md` — istruzioni di deploy
- `architecture/`
  - `ai-analytic.md` — spec tecnica AssetAnalytic
  - `strategy-v2.md` — spec tecnica Strategy V2 + mine
  - `redis-keys.md` — convenzioni chiavi Redis
- `audits/` — audit report storici
- `api/` — documentazione API
- `runbooks/` — procedure operative
EOF
log "  ✓ README scritti"

# ----------------------------------------------------------------------------
log ""
log "==> Riorganizzazione completata."
log ""
log "Prossimi passi:"
log "  1. pnpm build           # deve passare senza errori"
log "  2. pnpm test            # deve passare 100 test"
log "  3. git status           # i file devono apparire come 'renamed'"
log "  4. git add -A && git commit -m 'chore: reorganize codebase to analytics/research/core structure'"
log ""
log "Log dettagliato: $LOG_FILE"
