#!/usr/bin/env bash
set -euo pipefail
# Initialize PostgreSQL with all migration files
# Run this after postgres container is healthy

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-shop_user}"
PGPASSWORD="${PGPASSWORD:-shop_pass_local}"
PGDATABASE="${PGDATABASE:-shop}"

export PGPASSWORD

echo "[init-db] Running migrations against $PGHOST:$PGPORT/$PGDATABASE..."

for f in "$REPO_ROOT/db/migrations"/V*.sql; do
  echo "  -> $(basename "$f")"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$f" 2>&1 | head -5
done

echo "[init-db] All migrations applied."
