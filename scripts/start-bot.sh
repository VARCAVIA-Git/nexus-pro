#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# NEXUS PRO — Start Next.js + Auto-resume Bot
# Usage: bash scripts/start-bot.sh
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PORT="${PORT:-3000}"
LOG_FILE="$PROJECT_DIR/nexus-bot.log"

echo "═══════════════════════════════════════"
echo " NEXUS PRO v5.0 — Starting"
echo "═══════════════════════════════════════"

cd "$PROJECT_DIR"

# Build if needed
if [ ! -d ".next" ]; then
  echo "📦 Building..."
  pnpm build
fi

# Start Next.js in background
echo "🚀 Starting Next.js on port $PORT..."
pnpm start --port "$PORT" > "$LOG_FILE" 2>&1 &
NEXT_PID=$!
echo "   PID: $NEXT_PID"

# Wait for server to be ready
echo "⏳ Waiting for server..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    echo "✅ Server ready"
    break
  fi
  sleep 1
done

# Auto-resume bot if it was running before restart
echo "🔍 Checking for saved bot config..."
RESUME_RESULT=$(curl -s "http://localhost:$PORT/api/bot/resume" -X POST 2>/dev/null || echo '{"resumed":false}')
RESUMED=$(echo "$RESUME_RESULT" | grep -o '"resumed":true' || true)

if [ -n "$RESUMED" ]; then
  echo "🤖 Bot auto-resumed from saved config!"
else
  echo "ℹ️  No saved config — bot not started. Use the UI to launch."
fi

echo ""
echo "═══════════════════════════════════════"
echo " 🌐 Dashboard: http://localhost:$PORT"
echo " 📊 Status:    http://localhost:$PORT/status"
echo " 📝 Logs:      $LOG_FILE"
echo " 🛑 Stop:      kill $NEXT_PID"
echo "═══════════════════════════════════════"

# Keep running
wait $NEXT_PID
