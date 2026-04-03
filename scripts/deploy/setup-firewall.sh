#!/bin/bash
# NEXUS PRO — UFW Firewall Setup
echo "🔒 Configurazione firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Dev server (rimuovi in produzione)
sudo ufw --force enable
sudo ufw status verbose
echo "✅ Firewall configurato"
