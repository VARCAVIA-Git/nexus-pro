#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NEXUS PRO — Start Production (PM2)
# ═══════════════════════════════════════════════════════════════

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════"
echo " NEXUS PRO v5.0 — Production Start"
echo "═══════════════════════════════════════"

echo "📦 Building..."
pnpm build

echo "🚀 Starting with PM2..."
pm2 start ecosystem.config.js

echo "💾 Saving PM2 config (auto-restart on reboot)..."
pm2 save

echo ""
echo "═══════════════════════════════════════"
echo " ✅ Nexus Pro running!"
echo " 🌐 Web:    http://localhost:3000"
echo " 🤖 Bot:    pm2 logs nexus-bot"
echo " 📊 Status: pm2 status"
echo " 🛑 Stop:   pm2 stop all"
echo "═══════════════════════════════════════"
