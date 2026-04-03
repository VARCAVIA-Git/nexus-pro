#!/bin/bash
# NEXUS PRO — SSL Certificate via Let's Encrypt
DOMAIN=${1:-"nexus.yourdomain.com"}
echo "🔐 Certificato SSL per $DOMAIN..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m your@email.com
echo "✅ SSL configurato per $DOMAIN"
# Auto-renewal è già attivo via certbot timer
