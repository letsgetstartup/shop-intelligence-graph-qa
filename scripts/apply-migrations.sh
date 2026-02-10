#!/usr/bin/env bash
# =============================================================================
# ARM64-safe SQL Migration Runner (replaces Flyway)
# Applies all SQL migration files in db/migrations/ via psql.
# Tracks applied migrations in a __schema_version table to prevent re-runs.
#
# Usage:
#   bash scripts/apply-migrations.sh
#   # Or with custom connection:
#   POSTGRES_URL=postgresql://user:pass@host:5432/db bash scripts/apply-migrations.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$REPO_ROOT/db/migrations}"
POSTGRES_URL="${POSTGRES_URL:-postgresql://shop_user:shop_pass_local@localhost:5433/shop}"

PASS=0
FAIL=0
SKIP=0

pass() { echo "  [APPLIED] $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAILED]  $1 -- $2"; FAIL=$((FAIL + 1)); }
skip() { echo "  [SKIPPED] $1 (already applied)"; SKIP=$((SKIP + 1)); }

echo "============================================="
echo "SQL Migration Runner (ARM64-safe, no Flyway)"
echo "============================================="
echo "  Migrations dir: $MIGRATIONS_DIR"
echo "  Postgres URL:   ${POSTGRES_URL%%@*}@***"
echo ""

# Wait for Postgres to be ready
echo "--- Waiting for PostgreSQL ---"
for i in $(seq 1 30); do
    if psql "$POSTGRES_URL" -c "SELECT 1" >/dev/null 2>&1; then
        echo "  PostgreSQL is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  [FATAL] PostgreSQL not reachable after 60 seconds."
        exit 1
    fi
    sleep 2
done

# Create the schema version tracking table if it doesn't exist
psql "$POSTGRES_URL" -q <<'SQL'
CREATE TABLE IF NOT EXISTS __schema_version (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT now(),
    success BOOLEAN DEFAULT true
);
SQL
echo ""

# Apply migrations in sorted order
echo "--- Applying Migrations ---"
for migration in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    BASENAME=$(basename "$migration")
    CHECKSUM=$(sha256sum "$migration" | cut -d' ' -f1)

    # Check if already applied
    ALREADY=$(psql "$POSTGRES_URL" -tAq -c "SELECT COUNT(*) FROM __schema_version WHERE filename = '$BASENAME' AND success = true" 2>/dev/null || echo "0")

    if [ "$ALREADY" != "0" ] && [ "$ALREADY" != "" ]; then
        skip "$BASENAME"
        continue
    fi

    # Apply the migration
    if psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null 2>&1; then
        psql "$POSTGRES_URL" -q -c "INSERT INTO __schema_version (filename, checksum) VALUES ('$BASENAME', '$CHECKSUM') ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now(), success = true"
        pass "$BASENAME"
    else
        psql "$POSTGRES_URL" -q -c "INSERT INTO __schema_version (filename, checksum, success) VALUES ('$BASENAME', '$CHECKSUM', false) ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now(), success = false" 2>/dev/null || true
        fail "$BASENAME" "SQL error (see above)"
    fi
done

# Summary
echo ""
echo "============================================="
echo "Migration Summary"
echo "============================================="
echo "  APPLIED: $PASS"
echo "  SKIPPED: $SKIP"
echo "  FAILED:  $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "RESULT: MIGRATIONS HAVE FAILURES."
    exit 1
else
    echo "RESULT: ALL MIGRATIONS OK."
    exit 0
fi
