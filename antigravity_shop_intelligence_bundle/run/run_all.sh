#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_ZIP="${ROOT_DIR}/inputs/shop_intelligence_pg_graph_package.zip"
XLSX="${ROOT_DIR}/inputs/solidcam_graph_simulated_production.xlsx"
WORK_DIR="${ROOT_DIR}/work"

mkdir -p "${WORK_DIR}"
unzip -o "${PKG_ZIP}" -d "${WORK_DIR}/shop_intelligence_pg_graph_package"
cp -f "${XLSX}" "${WORK_DIR}/solidcam_graph_simulated_production.xlsx"

cd "${WORK_DIR}/shop_intelligence_pg_graph_package"

docker compose up -d postgres falkordb
docker compose run --rm flyway

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip >/dev/null
pip install pandas openpyxl sqlalchemy psycopg2-binary >/dev/null

python scripts/load_excel_to_postgres.py \
  --excel ../solidcam_graph_simulated_production.xlsx \
  --postgres postgresql://shop_user:shop_pass@localhost:5432/shop \
  --schema shop

docker compose run --rm -e MODE=full_rebuild -e GRAPH_NAME=shop_intelligence graph_builder

echo "=== POSTGRES COUNTS ==="
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS jobs FROM shop."jb_Jobs";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS ops FROM shop."jb_JobOperations";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS req_tools FROM shop."kg_JobOpRequiredTools";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS assemblies FROM shop."kg_ToolAssembly";'

echo "=== FALKORDB LABEL COUNTS ==="
docker compose exec -T falkordb redis-cli GRAPH.QUERY shop_intelligence \
  "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC LIMIT 10"

echo "DONE."
