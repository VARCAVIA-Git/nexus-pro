#!/bin/bash
# ============================================================
# CLARITY DAEMON v2 — usa Clarity Engine (Python + LiteLLM)
# ============================================================
# Invocato per-progetto. Lo stato vive in .clarity/, il codice
# del progetto nella root.
# ============================================================

set -euo pipefail

CLARITY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ROOT="$(cd "$CLARITY_DIR/.." && pwd)"
MEMORY_DIR="$CLARITY_DIR/memory"
TASKS_DIR="$CLARITY_DIR/tasks"
LOGS_DIR="$CLARITY_DIR/logs"
EVAL_DIR="$CLARITY_DIR/eval"
CONTEXT_DIR="$CLARITY_DIR/context"
BACKUP_DIR="$CLARITY_DIR/backups"

PID_FILE="$CLARITY_DIR/.daemon.pid"
CYCLE_COUNT_FILE="$CLARITY_DIR/.cycle_count"
CONFIG_FILE="$CLARITY_DIR/clarity.conf"
PANIC_LOCAL="$CLARITY_DIR/.PANIC"
PANIC_GLOBAL="$HOME/clarity/.PANIC"

# Path all'engine (override in clarity.conf)
CLARITY_HOME="${CLARITY_HOME:-$HOME/clarity}"
ENGINE_PY="$CLARITY_HOME/engine/clarity_engine.py"
PYTHON_BIN="$CLARITY_HOME/venv/bin/python"

# Defaults
COOLDOWN_BASE=180
COOLDOWN_ERROR=240
COOLDOWN_MAX=900
SESSION_TIMEOUT=300
META_LOOP_INTERVAL=3
MAX_CONSECUTIVE_ERRORS=3
PROJECT_NAME="$(basename "$PROJECT_ROOT")"

[ -f "$CONFIG_FILE" ] && source "$CONFIG_FILE"
# Carica env globale (chiavi API per LiteLLM)
GLOBAL_ENV="$CLARITY_HOME/config/.env"
if [ -f "$GLOBAL_ENV" ]; then set -a; . "$GLOBAL_ENV"; set +a; fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; PURPLE='\033[0;35m'; CYAN='\033[0;36m'; NC='\033[0m'

log() {
    local level="$1"; shift
    local ts; ts=$(date '+%Y-%m-%d %H:%M:%S')
    local msg="[$ts] [$level] $*"
    mkdir -p "$LOGS_DIR"
    echo -e "$msg" >> "$LOGS_DIR/daemon.log"
    case "$level" in
        INFO)  echo -e "${GREEN}$msg${NC}" ;;
        WARN)  echo -e "${YELLOW}$msg${NC}" ;;
        ERROR) echo -e "${RED}$msg${NC}" ;;
        CYCLE) echo -e "${CYAN}$msg${NC}" ;;
        META)  echo -e "${PURPLE}$msg${NC}" ;;
        *)     echo "$msg" ;;
    esac
}

ensure_dirs() {
    mkdir -p "$MEMORY_DIR" "$TASKS_DIR" "$LOGS_DIR" "$EVAL_DIR" "$CONTEXT_DIR" "$BACKUP_DIR"
}

get_cycle_count() { [ -f "$CYCLE_COUNT_FILE" ] && cat "$CYCLE_COUNT_FILE" || echo "0"; }
increment_cycle() {
    local c; c=$(get_cycle_count)
    echo $((c + 1)) > "$CYCLE_COUNT_FILE"
    echo $((c + 1))
}

panic_active() {
    [ -f "$PANIC_LOCAL" ] || [ -f "$PANIC_GLOBAL" ]
}

approvals_pending() {
    # Se APPROVALS.md contiene blocco "PENDING REQUEST" senza corrispondente KEY=si
    local ap="$CLARITY_DIR/APPROVALS.md"
    [ ! -f "$ap" ] && return 1
    # Estrae chiavi PENDING non ancora autorizzate
    local pending
    pending=$(awk '
        /^# PENDING REQUEST/ { inblock=1 }
        inblock && /^# Key:/ { gsub(/^# Key: */,""); pending=$0 }
        /^[A-Z_]+=si/ { approved[$0]=1 }
        END {
            for (p in approved) {}
            if (pending != "" && !(pending"=si" in approved)) print pending
        }' "$ap")
    [ -n "$pending" ]
}

run_cycle() {
    local cycle_num; cycle_num=$(increment_cycle)
    local is_meta=""
    if [ $((cycle_num % META_LOOP_INTERVAL)) -eq 0 ]; then
        is_meta="--meta"
        log META "=== META-LOOP ATTIVO (ciclo #$cycle_num) ==="
    fi

    if panic_active; then
        log ERROR "PANIC flag attivo — ciclo abortito"
        return 2
    fi

    log CYCLE "=== INIZIO CICLO #$cycle_num ==="

    local exit_code=0
    timeout "$SESSION_TIMEOUT" "$PYTHON_BIN" "$ENGINE_PY" \
        --project "$PROJECT_NAME" \
        --clarity-dir "$CLARITY_DIR" \
        --cycle "$cycle_num" \
        $is_meta \
        >> "$LOGS_DIR/cycle_${cycle_num}.log" \
        2>> "$LOGS_DIR/engine_stderr.log" \
        || exit_code=$?

    case $exit_code in
        0)   log INFO "Ciclo #$cycle_num OK"; return 0 ;;
        2)   log WARN "Ciclo #$cycle_num abortito (panic)"; return 2 ;;
        124) log WARN "Ciclo #$cycle_num: timeout ($SESSION_TIMEOUT s)"; return 1 ;;
        *)   log ERROR "Ciclo #$cycle_num: errore (exit $exit_code)"; return 1 ;;
    esac
}

daemon_loop() {
    local consecutive_errors=0
    local cooldown=$COOLDOWN_BASE

    log INFO "========================================"
    log INFO "  CLARITY DAEMON v2 AVVIATO"
    log INFO "  Progetto: $PROJECT_NAME ($PROJECT_ROOT)"
    log INFO "  Engine: $ENGINE_PY"
    log INFO "  PID: $$"
    log INFO "========================================"

    echo $$ > "$PID_FILE"
    trap 'log INFO "Daemon fermato"; rm -f "$PID_FILE"; exit 0' SIGTERM SIGINT

    while true; do
        if panic_active; then
            log WARN "PANIC rilevato. Fermo daemon."
            rm -f "$PID_FILE"
            exit 0
        fi
        if [ -f "$CLARITY_DIR/.stop_daemon" ]; then
            log INFO "Stop richiesto"
            rm -f "$CLARITY_DIR/.stop_daemon" "$PID_FILE"
            exit 0
        fi
        if approvals_pending; then
            log WARN "Approvazione umana pendente — pausa 2 min"
            sleep 120
            continue
        fi

        local rc=0
        run_cycle || rc=$?
        if [ $rc -eq 0 ]; then
            consecutive_errors=0
            cooldown=$COOLDOWN_BASE
        elif [ $rc -eq 2 ]; then
            log WARN "Panic gestito nel ciclo"
            sleep 10
        else
            consecutive_errors=$((consecutive_errors + 1))
            cooldown=$((COOLDOWN_ERROR * consecutive_errors))
            [ $cooldown -gt $COOLDOWN_MAX ] && cooldown=$COOLDOWN_MAX
            log WARN "Errori consecutivi: $consecutive_errors/$MAX_CONSECUTIVE_ERRORS"
            if [ $consecutive_errors -ge $MAX_CONSECUTIVE_ERRORS ]; then
                log ERROR "Troppi errori — pausa 5 min"
                sleep 300
                consecutive_errors=0
            fi
        fi

        log INFO "Prossimo ciclo in ${cooldown}s"
        sleep "$cooldown"
    done
}

show_status() {
    echo -e "${CYAN}=== CLARITY DAEMON — $PROJECT_NAME ===${NC}"
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo -e "  Stato: ${GREEN}ATTIVO${NC} (PID $(cat "$PID_FILE"))"
    else
        echo -e "  Stato: ${RED}FERMO${NC}"
    fi
    echo -e "  Cicli: ${YELLOW}$(get_cycle_count)${NC}"
    panic_active && echo -e "  ${RED}⚠ PANIC ATTIVO${NC}"
    approvals_pending && echo -e "  ${YELLOW}⏳ approvazione pendente in APPROVALS.md${NC}"
    [ -f "$MEMORY_DIR/STATE.md" ] && { echo; echo -e "${BLUE}--- STATE ---${NC}"; head -15 "$MEMORY_DIR/STATE.md"; }
    [ -f "$MEMORY_DIR/HANDOFF.md" ] && { echo; echo -e "${BLUE}--- HANDOFF ---${NC}"; head -15 "$MEMORY_DIR/HANDOFF.md"; }
}

stop_daemon() {
    if [ -f "$PID_FILE" ]; then
        local pid; pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            touch "$CLARITY_DIR/.stop_daemon"
            echo -e "${YELLOW}Stop richiesto, daemon termina dopo ciclo corrente.${NC}"
        else
            rm -f "$PID_FILE"
            echo -e "${YELLOW}PID stale rimosso.${NC}"
        fi
    else
        echo -e "${YELLOW}Nessun daemon attivo.${NC}"
    fi
}

reset_system() {
    : > "$TASKS_DIR/CURRENT.md"
    echo "0" > "$CYCLE_COUNT_FILE"
    {
        echo "## Stato: RESET"
        echo "Data: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Motivo: Reset manuale"
    } > "$MEMORY_DIR/STATE.md"
    echo -e "${GREEN}Reset OK.${NC}"
}

case "${1:-start}" in
    --status|status) ensure_dirs; show_status ;;
    --stop|stop)     stop_daemon ;;
    --reset|reset)   reset_system ;;
    --help|-h)       echo "Uso: $0 [start|--status|--stop|--reset]" ;;
    start|*)
        ensure_dirs
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo -e "${YELLOW}Daemon già attivo (PID $(cat "$PID_FILE"))${NC}"
            exit 1
        fi
        daemon_loop
        ;;
esac
