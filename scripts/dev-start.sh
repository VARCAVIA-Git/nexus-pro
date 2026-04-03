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
