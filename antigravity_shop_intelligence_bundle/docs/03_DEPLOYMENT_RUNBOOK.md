# Deployment Runbook (Antigravity)

This runbook assumes:
- You are running inside the `antigravity_shop_intelligence_bundle/` folder.
- Inputs exist under `inputs/`:
  - `inputs/shop_intelligence_pg_graph_package.zip`
  - `inputs/solidcam_graph_simulated_production.xlsx`

## 0) Preconditions (must pass)
Run:
- `docker --version`
- `docker compose version`
- `python3 --version` (or `python --version`)

If any are missing, stop and install/fix before continuing.

---

## 1) Unpack the package
```bash
mkdir -p work
unzip -o inputs/shop_intelligence_pg_graph_package.zip -d work/shop_intelligence_pg_graph_package
cp -f inputs/solidcam_graph_simulated_production.xlsx work/solidcam_graph_simulated_production.xlsx
cd work/shop_intelligence_pg_graph_package
```

Verify:
```bash
ls -la
```
Expected: `docker-compose.yml`, `db/migrations/`, `graph_builder/`, `scripts/`

---

## 2) Start Postgres + FalkorDB
```bash
docker compose up -d postgres falkordb
docker compose ps
```
Wait until both show **healthy**.

If not healthy, inspect logs:
```bash
docker compose logs --tail=200 postgres
docker compose logs --tail=200 falkordb
```

---

## 3) Apply DB migrations (Flyway)
```bash
docker compose run --rm flyway
```

Verify Flyway succeeded:
```bash
docker compose logs --tail=200 flyway
```

---

## 4) Load Excel demo dataset into Postgres
Create a venv (recommended) and install dependencies:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install pandas openpyxl sqlalchemy psycopg2-binary
```

Run loader:
```bash
python scripts/load_excel_to_postgres.py   --excel ../solidcam_graph_simulated_production.xlsx   --postgres postgresql://shop_user:shop_pass@localhost:5432/shop   --schema shop
```

---

## 5) Verify data in Postgres
```bash
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS jobs FROM shop."jb_Jobs";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS ops FROM shop."jb_JobOperations";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS req_tools FROM shop."kg_JobOpRequiredTools";'
docker compose exec -T postgres psql -U shop_user -d shop -c 'SELECT COUNT(*) AS assemblies FROM shop."kg_ToolAssembly";'
```
Expected: counts > 0.

---

## 6) Verify graph export views exist
```bash
docker compose exec -T postgres psql -U shop_user -d shop -c "SELECT table_schema, table_name FROM information_schema.views WHERE table_schema='graph_export' ORDER BY table_name LIMIT 50;"
```
Expected: `node_*` and `edge_*` views.

---

## 7) Build the graph in FalkorDB
Run full rebuild:
```bash
docker compose run --rm -e MODE=full_rebuild -e GRAPH_NAME=shop_intelligence graph_builder
```

---

## 8) Verify graph
```bash
docker compose exec -T falkordb redis-cli PING
docker compose exec -T falkordb redis-cli GRAPH.LIST
docker compose exec -T falkordb redis-cli GRAPH.QUERY shop_intelligence "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC LIMIT 10"
```

Expected: non-zero node counts for labels like `Operation`, `Job`, `Machine`, `ToolAssembly`.

---

## 9) Optional teardown
Stop:
```bash
docker compose down
```

Stop + delete volumes (destructive):
```bash
docker compose down -v
```
