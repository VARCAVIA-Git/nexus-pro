#!/bin/bash
# NexusOne v3 — Activate paper trading
#
# Sets Redis flags to put v3 into paper mode. The cron worker
# will pick up nexusone:v3:mode = 'paper' and start ticking.
#
# Live activation is NOT done by this script; it requires:
#   - mode = 'live' (or 'live_micro')
#   - nexusone:v3:approve_live = true (manual)
# This is intentional — live execution is gated by explicit human approval.

set -e
cd "$(dirname "$0")/.."

if [ -z "$UPSTASH_REDIS_REST_URL" ] || [ -z "$UPSTASH_REDIS_REST_TOKEN" ]; then
  if [ -f .env.local ]; then
    echo "Loading .env.local..."
    set -a
    . ./.env.local
    set +a
  fi
fi

if [ -z "$UPSTASH_REDIS_REST_URL" ] && [ -z "$REDIS_URL" ]; then
  echo "ERROR: neither REDIS_URL nor UPSTASH_REDIS_REST_URL is set"
  exit 1
fi

set_key() {
  local key="$1" value="$2"
  if [ -n "$REDIS_URL" ]; then
    redis-cli -u "$REDIS_URL" SET "$key" "$value"
  else
    curl -s -X POST "$UPSTASH_REDIS_REST_URL/set/$key/$value" \
      -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
      | python3 -c "import json,sys; print('  →',json.load(sys.stdin).get('result','ERROR'))"
  fi
}

get_key() {
  local key="$1"
  if [ -n "$REDIS_URL" ]; then
    redis-cli -u "$REDIS_URL" GET "$key"
  else
    curl -s "$UPSTASH_REDIS_REST_URL/get/$key" \
      -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',''))"
  fi
}

echo "═══════════════════════════════════════"
echo "  NexusOne v3 — Activate paper trading"
echo "═══════════════════════════════════════"

echo "Setting nexusone:v3:mode = paper"
set_key "nexusone:v3:mode" "paper"

echo ""
echo "Verifying..."
mode=$(get_key "nexusone:v3:mode")
echo "  mode: $mode"
if [ "$mode" = "paper" ] || [ "$mode" = "\"paper\"" ]; then
  echo ""
  echo "v3 PAPER trading ACTIVATED."
  echo "Cron should call POST /api/nexusone/v3/tick on each 1H + 4H bar close."
  echo "Status:  GET /api/nexusone/v3/status"
else
  echo ""
  echo "WARNING: activation may have failed. Check Redis manually."
fi
