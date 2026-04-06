#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NEXUS PRO — Cloudflare Tunnel (accesso remoto da smartphone)
# ═══════════════════════════════════════════════════════════════

# Install cloudflared if not present
if ! command -v cloudflared &>/dev/null; then
  echo "📥 Installing cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null || mv /tmp/cloudflared ~/.local/bin/cloudflared
  echo "✅ cloudflared installed"
fi

echo ""
echo "═══════════════════════════════════════"
echo " NEXUS PRO — Tunnel Attivo"
echo " Apri l'URL che appare qui sotto"
echo " dal tuo smartphone per accedere"
echo " alla dashboard di trading."
echo "═══════════════════════════════════════"
echo ""

cloudflared tunnel --url http://localhost:3000
