#!/usr/bin/env bash
# NexusOne v3 watchdog — invoked by cron on droplet every 5 min.
# Reads .v3-state/heartbeat.json. If ts > 15 min old, sends Discord alert
# and attempts pm2 restart. Idempotent: writes lock file to avoid duplicate alerts.

set -uo pipefail

REPO_DIR="${REPO_DIR:-/home/nexus/nexus-pro}"
STATE_DIR="$REPO_DIR/.v3-state"
HEARTBEAT="$STATE_DIR/heartbeat.json"
ALERT_LOCK="$STATE_DIR/.watchdog-alerted"
WATCHDOG_LOG="$STATE_DIR/watchdog.log"

# Load DISCORD_WEBHOOK_URL from .env.local (basic parser, no shell expansion)
if [ -f "$REPO_DIR/.env.local" ]; then
  WEBHOOK=$(grep -E '^DISCORD_WEBHOOK_URL=' "$REPO_DIR/.env.local" | cut -d= -f2- | tr -d '"' | tr -d "'")
else
  WEBHOOK=""
fi

now_ms=$(($(date +%s) * 1000))
threshold_ms=$((15 * 60 * 1000))

post_discord() {
  local msg="$1"
  [ -z "$WEBHOOK" ] && return
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "$(printf '{"content":%s}' "$(printf '%s' "$msg" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')")" \
    "$WEBHOOK" >/dev/null 2>&1 || true
}

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >> "$WATCHDOG_LOG"
}

# 1) Heartbeat freshness check
if [ ! -f "$HEARTBEAT" ]; then
  log "WARN: heartbeat.json missing"
  if [ ! -f "$ALERT_LOCK" ]; then
    post_discord "🚨 NexusOne v3 watchdog: heartbeat.json missing on droplet. Daemon may have never started."
    touch "$ALERT_LOCK"
  fi
  pm2 restart nexus-v3-paper 2>>"$WATCHDOG_LOG" || true
  exit 0
fi

hb_ts=$(python3 -c "import json,sys; print(json.load(open('$HEARTBEAT'))['ts'])" 2>/dev/null || echo 0)
age_ms=$((now_ms - hb_ts))

if [ "$age_ms" -gt "$threshold_ms" ]; then
  age_min=$((age_ms / 60000))
  log "STALE heartbeat: ${age_min}min old"
  if [ ! -f "$ALERT_LOCK" ]; then
    eq=$(python3 -c "import json; d=json.load(open('$HEARTBEAT')); print(f\"\${d['equity']:.2f} (DD {d['drawdownPct']*100:.2f}%)\")" 2>/dev/null || echo "?")
    post_discord "🚨 NexusOne v3: heartbeat ${age_min}min stale. Last equity=$eq. Restarting daemon."
    touch "$ALERT_LOCK"
  fi
  pm2 restart nexus-v3-paper 2>>"$WATCHDOG_LOG" || true
else
  # Heartbeat is fresh — clear alert lock
  if [ -f "$ALERT_LOCK" ]; then
    log "RECOVERED: heartbeat fresh, clearing alert lock"
    post_discord "✅ NexusOne v3: heartbeat recovered, daemon healthy."
    rm -f "$ALERT_LOCK"
  fi
fi

# 2) Daily summary at 00:05 UTC
if [ "$(date -u +%H%M)" = "0005" ]; then
  if [ -f "$HEARTBEAT" ] && [ -n "$WEBHOOK" ]; then
    msg=$(python3 -c "
import json
d = json.load(open('$HEARTBEAT'))
print(f\"📊 NexusOne v3 daily — equity=\${d['equity']:.2f} peak=\${d['peakEquity']:.2f} DD={d['drawdownPct']*100:.3f}% open={d['openCount']} closed={d['closedCount']} active={d['activeTuples']}/{d['totalTuples']}\")
" 2>/dev/null)
    [ -n "$msg" ] && post_discord "$msg"
  fi
fi
