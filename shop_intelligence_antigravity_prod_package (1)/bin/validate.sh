#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../deploy"

echo "== docker ps =="
docker ps --format "table {{.Names}}	{{.Status}}	{{.Ports}}"

echo "== Postgres schemas =="
docker exec -i shop_pg psql -U shop_user -d shop -c "select table_schema, count(*) from information_schema.tables where table_schema in ('shop','core','graph_export','qw') group by 1 order by 1;"
docker exec -i shop_pg psql -U shop_user -d shop -c "select table_schema, count(*) from information_schema.views where table_schema in ('shop','core','graph_export','qw') group by 1 order by 1;"

echo "== Key row counts (should be >0) =="
docker exec -i shop_pg psql -U shop_user -d shop -c "select count(*) from shop.\"jb_JobOperations\";"
docker exec -i shop_pg psql -U shop_user -d shop -c "select count(*) from shop.\"kg_JobOpRequiredTools\";"
docker exec -i shop_pg psql -U shop_user -d shop -c "select count(*) from shop.\"kg_MachineMagazine\";"
docker exec -i shop_pg psql -U shop_user -d shop -c "select count(*) from shop.\"kg_ToolInventoryLots\";"
docker exec -i shop_pg psql -U shop_user -d shop -c "select count(*) from qw.shift_plan;"

echo "== FalkorDB graph list and label counts =="
docker exec -i shop_falkordb redis-cli GRAPH.LIST || true
docker exec -i shop_falkordb redis-cli GRAPH.QUERY shop "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC LIMIT 10" || true

echo "== API health =="
curl -s "http://localhost:3001/health" || true

echo "== QueryWeaver smoke test =="
curl -s -X POST "http://localhost:3001/queryweaver/query" -H "content-type: application/json" \
  -d '{"question":"What tools are missing for the next shift per machine?","params":{}}' | head -c 2000
echo
