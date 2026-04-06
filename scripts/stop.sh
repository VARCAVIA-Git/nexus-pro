#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NEXUS PRO — Stop All
# ═══════════════════════════════════════════════════════════════

pm2 stop all
echo "⏹️ Nexus Pro fermato"
echo "Per riavviare: bash scripts/start-production.sh"
