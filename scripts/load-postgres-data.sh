#!/usr/bin/env bash
set -euo pipefail
# Load all manufacturing data into PostgreSQL tables

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.local.yml"
PSQL="$COMPOSE exec -T postgres psql -U shop_user -d shop"

echo "============================================"
echo " Loading data into PostgreSQL"
echo "============================================"

# Disable FK checks for bulk loading
$PSQL -c "SET session_replication_role = 'replica';" 2>/dev/null || true

echo ""
echo "[1/2] Loading ERP CSV data..."

load_csv() {
  local table="$1"
  local csv="$2"
  if [ -f "$csv" ]; then
    local rows=$(( $(wc -l < "$csv" | tr -d ' ') - 1 ))
    echo "  $table <- $(basename $csv) ($rows rows)"
    $PSQL -c "SET session_replication_role = 'replica'; TRUNCATE TABLE shop.\"$table\" CASCADE;" 2>/dev/null || true
    $PSQL -c "SET session_replication_role = 'replica'; \\COPY shop.\"$table\" FROM STDIN WITH CSV HEADER" < "$csv" 2>/dev/null
  else
    echo "  SKIP $table (not found: $csv)"
  fi
}

# Load in FK-safe order
load_csv "jb_Customers"          "data/erp/jb_Customers.csv"
load_csv "jb_Employees"          "data/erp/jb_Employees.csv"
load_csv "jb_Parts"              "data/erp/jb_Parts.csv"
load_csv "jb_WorkCenters"        "data/erp/jb_WorkCenters.csv"
load_csv "jb_Jobs"               "data/erp/jb_Jobs.csv"
load_csv "jb_SMKO_ClusterBridge" "data/erp/jb_SMKO_ClusterBridge.csv"
load_csv "jb_JobOperations"      "data/erp/jb_JobOperations.csv"
load_csv "jb_LaborDetails"       "data/erp/jb_LaborDetails.csv"

# Re-enable FK checks
$PSQL -c "SET session_replication_role = 'origin';" 2>/dev/null || true

echo ""
echo "[2/2] Loading kg_* tooling data from Excel..."

EXCEL_FILE="antigravity_shop_intelligence_bundle/inputs/solidcam_graph_simulated_production.xlsx"
LOADER="antigravity_shop_intelligence_bundle/deploy/scripts/load_excel_to_postgres.py"
PG_CONN="postgresql://shop_user:shop_pass_local@localhost:5433/shop"

if [ -f "$EXCEL_FILE" ] && [ -f "$LOADER" ]; then
  python3 -c "import pandas, psycopg" 2>/dev/null || pip3 install pandas psycopg "psycopg[binary]" openpyxl 2>&1 | tail -3
  python3 "$LOADER" --excel "$EXCEL_FILE" --pg "$PG_CONN" 2>&1
else
  echo "  SKIP - Excel/loader not found (kg_* tables empty)"
fi

echo ""
echo "=== Verification ==="
$PSQL -c "
  SELECT 'jb_Customers' as tbl, count(*) FROM shop.\"jb_Customers\"
  UNION ALL SELECT 'jb_Jobs', count(*) FROM shop.\"jb_Jobs\"
  UNION ALL SELECT 'jb_Parts', count(*) FROM shop.\"jb_Parts\"
  UNION ALL SELECT 'jb_JobOperations', count(*) FROM shop.\"jb_JobOperations\"
  UNION ALL SELECT 'jb_WorkCenters', count(*) FROM shop.\"jb_WorkCenters\"
  UNION ALL SELECT 'jb_Employees', count(*) FROM shop.\"jb_Employees\"
  UNION ALL SELECT 'jb_LaborDetails', count(*) FROM shop.\"jb_LaborDetails\"
  UNION ALL SELECT 'jb_ClusterBridge', count(*) FROM shop.\"jb_SMKO_ClusterBridge\"
  UNION ALL SELECT 'kg_ToolAssembly', count(*) FROM shop.\"kg_ToolAssembly\"
  UNION ALL SELECT 'kg_MachineMagazine', count(*) FROM shop.\"kg_MachineMagazine\"
  UNION ALL SELECT 'kg_JobOpRequired', count(*) FROM shop.\"kg_JobOpRequiredTools\"
  ORDER BY 1;
" 2>/dev/null

echo ""
echo "Data loading complete."
