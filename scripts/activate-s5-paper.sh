#!/bin/bash
# Activate S5 RSI Bidir in paper mode
# This sets Redis keys to enable the strategy in the cron tick loop

echo "═══════════════════════════════════════"
echo "  NexusOne — Activate S5 Paper Trading"
echo "═══════════════════════════════════════"
echo ""

# Check if UPSTASH vars are set
if [ -z "$UPSTASH_REDIS_REST_URL" ]; then
  echo "Loading .env.local..."
  export $(grep -v '^#' .env.local | xargs)
fi

if [ -z "$UPSTASH_REDIS_REST_URL" ]; then
  echo "ERROR: UPSTASH_REDIS_REST_URL not set"
  exit 1
fi

# Set active strategy
echo "Setting active strategy: S5_RSI_BIDIR_MAKER_V1"
curl -s -X POST "$UPSTASH_REDIS_REST_URL/set/nexusone:strategy:active/S5_RSI_BIDIR_MAKER_V1" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" | python3 -c "import json,sys; print('  →', json.load(sys.stdin).get('result','ERROR'))"

# Set mode to paper
echo "Setting mode: paper"
curl -s -X POST "$UPSTASH_REDIS_REST_URL/set/nexusone:mode/paper" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" | python3 -c "import json,sys; print('  →', json.load(sys.stdin).get('result','ERROR'))"

# Verify
echo ""
echo "Verifying..."
ACTIVE=$(curl -s "$UPSTASH_REDIS_REST_URL/get/nexusone:strategy:active" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',''))")
MODE=$(curl -s "$UPSTASH_REDIS_REST_URL/get/nexusone:mode" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',''))")

echo "  Active strategy: $ACTIVE"
echo "  System mode: $MODE"
echo ""

if [ "$ACTIVE" = "S5_RSI_BIDIR_MAKER_V1" ] && [ "$MODE" = "paper" ]; then
  echo "S5 paper trading ACTIVATED."
  echo "The cron worker will evaluate S5 signals every 30s."
else
  echo "WARNING: Activation may have failed. Check Redis manually."
fi
