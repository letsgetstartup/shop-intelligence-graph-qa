#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/deploy"

echo "== Starting core services =="
docker compose -f docker-compose.prod.yml up -d postgres falkordb

echo "== Running Flyway migrations (base + QueryWeaver semantic views) =="
docker compose -f docker-compose.prod.yml up -d flyway
sleep 2
docker compose -f docker-compose.prod.yml logs --tail=200 flyway || true

echo "== Loading Excel into Postgres =="
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/load_excel_to_postgres.py --excel solidcam_graph_simulated_production.xlsx --pg "postgresql://shop_user:shop_pass@localhost:5432/shop"

echo "== Building graph (full rebuild) =="
docker compose -f docker-compose.prod.yml up -d graph_builder
sleep 2
docker compose -f docker-compose.prod.yml logs --tail=200 graph_builder || true

echo "== Starting API =="
docker compose -f docker-compose.prod.yml up -d api

echo "== Done =="
echo "API:        http://<VM_IP>:3001"
echo "Graph UI:   http://<VM_IP>:3000"
