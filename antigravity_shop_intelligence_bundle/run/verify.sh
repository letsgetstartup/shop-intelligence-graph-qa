#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}/work/shop_intelligence_pg_graph_package"

docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS jobs FROM shop."jb_Jobs";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS ops FROM shop."jb_JobOperations";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS req_tools FROM shop."kg_JobOpRequiredTools";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS assemblies FROM shop."kg_ToolAssembly";'

docker compose exec -T falkordb redis-cli GRAPH.QUERY shop_intelligence \
  "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC LIMIT 10"
