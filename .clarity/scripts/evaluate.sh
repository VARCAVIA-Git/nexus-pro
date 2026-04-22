#!/bin/bash
# Clarity — valutazione manuale di un progetto
set -euo pipefail

CLARITY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ROOT="$(cd "$CLARITY_DIR/.." && pwd)"
LOGS_DIR="$CLARITY_DIR/logs"
EVAL_DIR="$CLARITY_DIR/eval"
CONFIG_FILE="$CLARITY_DIR/clarity.conf"

SKIP_PERMS=false
MAX_TURNS=40
[ -f "$CONFIG_FILE" ] && source "$CONFIG_FILE"

mkdir -p "$LOGS_DIR" "$EVAL_DIR"

DEEP="${1:-}"
TS=$(date '+%Y-%m-%d_%H%M%S')

if [ "$DEEP" = "--deep" ]; then
    echo "🔬 Deep eval + meta-loop..."
    PROMPT="Sei Clarity. Segui .clarity/CLAUDE.md.
Esegui una VALUTAZIONE PROFONDA:
1. Leggi TUTTI i file in .clarity/memory/, .clarity/tasks/, .clarity/eval/, .clarity/logs/
2. Analizza trend delle ultime N valutazioni
3. Identifica i 3 problemi più gravi
4. Per ciascuno proponi soluzione concreta
5. Scrivi .clarity/eval/LAST_EVAL.md
6. Scrivi .clarity/eval/DEEP_EVAL_${TS}.md
7. META-LOOP:
   - cp .clarity/CLAUDE.md .clarity/eval/CLAUDE_pre_meta_${TS}.md
   - Applica migliorie al sistema
   - Documenta in .clarity/memory/META.md
8. Aggiorna .clarity/memory/STATE.md
Rispetta le REGOLE DI SICUREZZA (no push, no deploy, no live mode)."
else
    echo "📊 Eval standard..."
    PROMPT="Sei Clarity. Segui .clarity/CLAUDE.md.
VALUTAZIONE STANDARD:
1. Leggi .clarity/memory/STATE.md, .clarity/tasks/{BACKLOG,COMPLETED}.md, .clarity/eval/LAST_EVAL.md
2. Calcola metriche (task completati, errori, qualità)
3. Confronta con eval precedente
4. Scrivi .clarity/eval/LAST_EVAL.md
5. Se qualità media < 3/5, segnala META-LOOP in .clarity/memory/STATE.md"
fi

args=(--print --max-turns "$MAX_TURNS")
[ "$SKIP_PERMS" = "true" ] && args+=(--dangerously-skip-permissions)

cd "$PROJECT_ROOT"
claude "${args[@]}" -p "$PROMPT" 2>> "$LOGS_DIR/eval_stderr.log" | tee "$LOGS_DIR/eval_${TS}.log"

echo
echo "✅ Eval completata → .clarity/eval/LAST_EVAL.md"
