#!/bin/bash
# Clarity — inietta contesto / comandi nel prossimo ciclo
set -euo pipefail

CLARITY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MEMORY_DIR="$CLARITY_DIR/memory"
TASKS_DIR="$CLARITY_DIR/tasks"
CTX="$CLARITY_DIR/context"
INJECTION="$CTX/INJECTION.md"

mkdir -p "$CTX"
TS=$(date '+%Y-%m-%d %H:%M:%S')

case "${1:-}" in
    --file)
        [ -z "${2:-}" ] && { echo "❌ ./inject.sh --file <path>"; exit 1; }
        {
            echo "## File iniettato — $TS"
            echo "File: $2"
            echo '```'
            cat "$2"
            echo '```'
            echo
        } >> "$INJECTION"
        echo "📄 File iniettato nel prossimo ciclo."
        ;;
    --priority)
        pr="${2:-P1}"; shift 2
        desc="$*"
        id="TASK-INJ-$(date +%s)"
        echo "- [ ] [$id] $desc | $pr | creato: $TS | iniettato" >> "$TASKS_DIR/BACKLOG.md"
        { echo "## Task iniettato $pr — $TS"; echo "$desc"; echo; } >> "$INJECTION"
        echo "🎯 [$id] aggiunto al backlog ($pr)."
        ;;
    --teach)
        shift; info="$*"
        { echo; echo "### Info — $TS"; echo "$info"; } >> "$MEMORY_DIR/CONTEXT.md"
        { echo "## Teach — $TS"; echo "$info"; echo; } >> "$INJECTION"
        echo "🧠 Info aggiunta al CONTEXT."
        ;;
    --approve)
        shift; key="$*"
        { echo "$key=si   # $TS"; } >> "$CLARITY_DIR/APPROVALS.md"
        echo "✅ Approvazione registrata: $key"
        ;;
    --help|-h|"")
        cat <<USAGE
Clarity inject

Uso:
  ./inject.sh "messaggio"              messaggio libero
  ./inject.sh --file <path>            inietta contenuto file
  ./inject.sh --priority P0 "desc"     aggiunge task con priorità
  ./inject.sh --teach "info"           aggiunge a CONTEXT
  ./inject.sh --approve CHIAVE         scrive approvazione
USAGE
        ;;
    *)
        { echo "## Messaggio utente — $TS"; echo "$*"; echo; } >> "$INJECTION"
        echo "💬 Messaggio registrato per il prossimo ciclo."
        ;;
esac
