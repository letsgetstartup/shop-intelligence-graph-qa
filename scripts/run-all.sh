#!/usr/bin/env bash
set -euo pipefail
# Master script: bring up stack, init DB, ingest data, verify
# Usage: bash scripts/run-all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "============================================"
echo " ShopIntel Sovereign Local Deployment"
echo " Siemens-grade Offline Operation"
echo "============================================"
echo ""

# Step 1: Start infrastructure
echo "[1/5] Starting infrastructure (PostgreSQL + FalkorDB)..."
docker compose -f docker-compose.local.yml up -d postgres falkordb
echo "  Waiting for services to be healthy..."
sleep 5

# Wait for postgres
for i in $(seq 1 30); do
  if docker compose -f docker-compose.local.yml exec -T postgres pg_isready -U shop_user -d shop >/dev/null 2>&1; then
    echo "  PostgreSQL is ready."
    break
  fi
  echo "  Waiting for PostgreSQL... ($i/30)"
  sleep 2
done

# Wait for FalkorDB
for i in $(seq 1 20); do
  if docker compose -f docker-compose.local.yml exec -T falkordb redis-cli PING 2>/dev/null | grep -q PONG; then
    echo "  FalkorDB is ready."
    break
  fi
  echo "  Waiting for FalkorDB... ($i/20)"
  sleep 2
done

# Step 2: Run DB migrations
echo ""
echo "[2/5] Running PostgreSQL migrations..."
for f in db/migrations/V*.sql; do
  echo "  -> $(basename "$f")"
  docker compose -f docker-compose.local.yml exec -T postgres \
    psql -U shop_user -d shop -f "/docker-entrypoint-initdb.d/$(basename "$f")" 2>&1 | tail -1
done
echo "  Migrations complete."

# Step 3: Build and start backend
echo ""
echo "[3/5] Building and starting backend..."
docker compose -f docker-compose.local.yml up -d --build backend
sleep 5

# Wait for backend
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:8080/ping >/dev/null 2>&1; then
    echo "  Backend is ready."
    break
  fi
  echo "  Waiting for backend... ($i/20)"
  sleep 3
done

# Step 4: Ingest data into FalkorDB graph
echo ""
echo "[4/5] Ingesting ERP data into FalkorDB graph..."
docker compose -f docker-compose.local.yml exec -T backend node ingest/ingest.js 2>&1 | tail -20

# Step 5: Build and start frontend
echo ""
echo "[5/5] Building and starting frontend..."
docker compose -f docker-compose.local.yml up -d --build frontend
sleep 3

echo ""
echo "============================================"
echo " DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo " Frontend (Wizechat):  http://localhost:3001"
echo " Backend API:          http://localhost:8080"
echo " FalkorDB Browser:     http://localhost:3000"
echo " PostgreSQL:           localhost:5432"
echo ""
echo " Test endpoints:"
echo "   curl http://localhost:8080/ping"
echo "   curl http://localhost:8080/testdb"
echo "   curl -X POST http://localhost:8080/query \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"question\":\"How many jobs are there?\"}'"
echo ""
