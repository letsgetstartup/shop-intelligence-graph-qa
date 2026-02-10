#!/usr/bin/env bash
# =============================================================================
# ShopIntel Volume Backup Script
# Creates timestamped backups of all persistent Docker volumes.
#
# Usage:
#   bash scripts/backup.sh [backup-dir]
#   # Default: ./backups/YYYY-MM-DD_HHMMSS/
#
# Recommended: Run via cron daily
#   0 2 * * * cd /opt/shopintel && bash scripts/backup.sh
# =============================================================================
set -euo pipefail

BACKUP_ROOT="${1:-./backups}"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-shopintel-dgx-spark}"

echo "============================================================"
echo " ShopIntel Backup"
echo "============================================================"
echo "  Project:  $COMPOSE_PROJECT"
echo "  Target:   $BACKUP_DIR"
echo "  Date:     $(date -Iseconds)"
echo ""

mkdir -p "$BACKUP_DIR"

# ─── Backup PostgreSQL via pg_dump ───
echo "[1/4] Backing up PostgreSQL..."
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml \
    exec -T postgres pg_dump -U shop_user -d shop --format=custom \
    > "$BACKUP_DIR/postgres-shop.dump" 2>/dev/null

if [ -s "$BACKUP_DIR/postgres-shop.dump" ]; then
    SIZE=$(du -sh "$BACKUP_DIR/postgres-shop.dump" | cut -f1)
    echo "  PostgreSQL backup: $SIZE"
else
    echo "  [WARN] PostgreSQL backup may be empty"
fi

# ─── Backup FalkorDB volume ───
echo "[2/4] Backing up FalkorDB..."
FALKOR_VOLUME="${COMPOSE_PROJECT}_falkordbdata"
if docker volume inspect "$FALKOR_VOLUME" >/dev/null 2>&1; then
    docker run --rm \
        -v "$FALKOR_VOLUME:/source:ro" \
        -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
        alpine tar czf /backup/falkordb-data.tar.gz -C /source .
    SIZE=$(du -sh "$BACKUP_DIR/falkordb-data.tar.gz" | cut -f1)
    echo "  FalkorDB backup: $SIZE"
else
    # Try alternative volume names
    ALT_VOLUME="shopintel-local_falkordbdata"
    if docker volume inspect "$ALT_VOLUME" >/dev/null 2>&1; then
        docker run --rm \
            -v "$ALT_VOLUME:/source:ro" \
            -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
            alpine tar czf /backup/falkordb-data.tar.gz -C /source .
        SIZE=$(du -sh "$BACKUP_DIR/falkordb-data.tar.gz" | cut -f1)
        echo "  FalkorDB backup: $SIZE (from $ALT_VOLUME)"
    else
        echo "  [WARN] FalkorDB volume not found"
    fi
fi

# ─── Backup Ollama models volume ───
echo "[3/4] Backing up Ollama models..."
OLLAMA_VOLUME="${COMPOSE_PROJECT}_ollama_data"
if docker volume inspect "$OLLAMA_VOLUME" >/dev/null 2>&1; then
    docker run --rm \
        -v "$OLLAMA_VOLUME:/source:ro" \
        -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
        alpine tar czf /backup/ollama-models.tar.gz -C /source .
    SIZE=$(du -sh "$BACKUP_DIR/ollama-models.tar.gz" | cut -f1)
    echo "  Ollama backup: $SIZE"
else
    ALT_VOLUME="shopintel-local_ollama_data"
    if docker volume inspect "$ALT_VOLUME" >/dev/null 2>&1; then
        docker run --rm \
            -v "$ALT_VOLUME:/source:ro" \
            -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
            alpine tar czf /backup/ollama-models.tar.gz -C /source .
        SIZE=$(du -sh "$BACKUP_DIR/ollama-models.tar.gz" | cut -f1)
        echo "  Ollama backup: $SIZE (from $ALT_VOLUME)"
    else
        echo "  [WARN] Ollama volume not found"
    fi
fi

# ─── Backup audit logs ───
echo "[4/4] Backing up audit logs..."
if [ -d "./audit" ] && [ "$(ls -A ./audit 2>/dev/null)" ]; then
    tar czf "$BACKUP_DIR/audit-logs.tar.gz" -C ./audit .
    SIZE=$(du -sh "$BACKUP_DIR/audit-logs.tar.gz" | cut -f1)
    echo "  Audit logs backup: $SIZE"
else
    echo "  [INFO] No audit logs to back up"
fi

# ─── Summary ───
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo ""
echo "============================================================"
echo " Backup Complete"
echo "============================================================"
echo "  Location:   $BACKUP_DIR"
echo "  Total size: $TOTAL_SIZE"
echo "  Files:"
ls -lh "$BACKUP_DIR/" | tail -n +2
echo ""

# ─── Prune old backups (keep last 7) ───
BACKUP_COUNT=$(ls -d "$BACKUP_ROOT"/20* 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 7 ]; then
    echo "  Pruning old backups (keeping last 7)..."
    ls -dt "$BACKUP_ROOT"/20* | tail -n +8 | xargs rm -rf
    echo "  Pruned $((BACKUP_COUNT - 7)) old backups."
fi

echo "============================================================"
