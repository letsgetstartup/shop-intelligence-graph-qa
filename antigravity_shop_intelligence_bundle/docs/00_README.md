# Shop Intelligence — Antigravity Bundle

Date: 2026-02-02

This folder is a **self-contained drop** for Antigravity agents to stand up a production-grade baseline:

- **PostgreSQL** as the canonical data contract (all upstream systems load here)
- **FalkorDB** as a derived, read-optimized property graph projection
- A runnable **Graph Builder** that maps Postgres `graph_export.*` views → FalkorDB graph (`shop_intelligence`)

## Contents
- `inputs/` — required artifacts (zip + Excel)
- `docs/` — professional documentation + execution instructions
- `run/` — helper scripts for end-to-end execution
- `work/` — runtime working directory created by scripts (safe to delete)

## Quick start
From this folder:
```bash
./run/run_all.sh
```

## Included inputs
- shop_intelligence_pg_graph_package.zip
- solidcam_graph_simulated_production.xlsx
- solidcam_graph.xlsx
- Screenshot 2026-02-02 at 19.28.14.png

## Notes
- The run scripts assume Docker + Docker Compose are installed and available.
- The loader uses Python 3 and installs dependencies into a local venv under `work/`.
