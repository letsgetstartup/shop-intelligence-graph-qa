# Shop Intelligence Graph (Postgres + FalkorDB)

This package gives you a **database-first** foundation:
- **PostgreSQL** holds the canonical data contract (all `jb_*` + `kg_*` tables).
- **graph_export.* views** project a stable node/edge feed for the graph layer.
- A runnable **Graph Builder** service reads from Postgres and (re)builds the **FalkorDB** property graph.

## 1) Start the stack

```bash
docker compose up -d --build
```

Services:
- Postgres on `localhost:5432`
- FalkorDB on `localhost:6379` (browser UI on `localhost:3000` if image includes it)
- Flyway runs migrations automatically on startup
- Graph Builder rebuilds the graph (default `MODE=full_rebuild`)

## 2) Load data (Excel → Postgres)

### Option A (recommended): your own ingestion pipeline
Load each upstream system into the `shop` schema tables:
- `shop."jb_*"` for ERP/MES exports
- `shop."kg_*"` for tooling/CAM/NC snapshots

As long as the data lands into these tables, the graph builder will work.

### Option B (starter script): load the included Excel model
A helper script is included under `scripts/` (requires Python packages):
```bash
cd scripts
pip install -r requirements.txt
python load_excel_to_postgres.py --excel ../solidcam_graph_simulated_production.xlsx --pg "postgresql://shop_user:shop_pass@localhost:5432/shop"
```

> The loader truncates the destination tables and re-inserts all sheets.

## 3) Verify Postgres objects

Connect:
```bash
psql "postgresql://shop_user:shop_pass@localhost:5432/shop"
```

Check tables:
```sql
\dn
\dt shop.*
\dv core.*
\dv graph_export.*
```

## 4) Verify the graph

Graph name defaults to: `shop_intelligence`.

Example:
```bash
redis-cli -p 6379 GRAPH.QUERY shop_intelligence "MATCH (n) RETURN labels(n), count(*)"
```

## 5) Graph Builder modes

- `MODE=full_rebuild` (default): deletes graph and rebuilds from scratch.
- `MODE=incremental` (placeholder): ready for phase-2 once you add watermarks / CDC.

Environment:
- `POSTGRES_URL`
- `FALKOR_URL`
- `GRAPH_NAME`
- `BATCH_SIZE`

## Production best practices (what to do next)

1. Treat Postgres as the only data contract (all sources load into it).
2. Keep graph as a **projection** (rebuildable, deterministic, read-optimized).
3. Add an **outbox/watermark** in `meta.graph_sync_state` for incremental sync.
4. Add validation tests (dbt or SQL checks) before exporting to graph.
5. Add ownership + data lineage fields in `raw` schema for each source adapter.

