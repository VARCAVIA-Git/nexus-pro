#!/bin/bash
# NEXUS PRO — Database Backup
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/nexus-backups"
mkdir -p "$BACKUP_DIR"

echo "📦 Backup database Nexus Pro..."

# Export via Supabase CLI
supabase db dump --project-ref "$SUPABASE_PROJECT_ID" \
  -f "$BACKUP_DIR/nexus_backup_${TIMESTAMP}.sql"

# Compress
gzip "$BACKUP_DIR/nexus_backup_${TIMESTAMP}.sql"

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/nexus_backup_*.sql.gz | tail -n +31 | xargs -r rm

echo "✅ Backup completato: nexus_backup_${TIMESTAMP}.sql.gz"
echo "📁 Directory: $BACKUP_DIR"
echo "📊 Backups presenti: $(ls "$BACKUP_DIR"/nexus_backup_*.sql.gz | wc -l)"
