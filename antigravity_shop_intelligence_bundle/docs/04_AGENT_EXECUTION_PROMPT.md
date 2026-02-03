# Antigravity Agent Execution Prompt (Copy/Paste)

You are an agent tasked with standing up the **Shop Intelligence DB + Graph** stack from the artifacts in this folder.

## Objective
Produce a working environment with:
- Postgres database `shop` populated from `solidcam_graph_simulated_production.xlsx`
- Flyway migrations applied (schemas: `shop`, `core`, `graph_export`)
- FalkorDB graph `shop_intelligence` populated from `graph_export.*`
- Verification output captured (row counts + graph label counts)

## Inputs
- `inputs/shop_intelligence_pg_graph_package.zip`
- `inputs/solidcam_graph_simulated_production.xlsx`

## Required deliverables
1) A short execution log (commands run + success indicators)
2) Postgres verification: counts for `shop."jb_Jobs"`, `shop."jb_JobOperations"`, `shop."kg_JobOpRequiredTools"`, `shop."kg_ToolAssembly"`
3) Graph verification: top 10 node label counts from FalkorDB

## Execution steps (strict order)
1) Unzip package to `work/` (do not edit zip contents)
2) Start `postgres` and `falkordb` containers
3) Run Flyway migrations
4) Load Excel into Postgres using the provided loader
5) Run Graph Builder in `full_rebuild` mode
6) Run verification queries (SQL + Cypher)
7) If any step fails, stop and report the error + relevant logs.

## Canonical command sequence
```bash
./run/run_all.sh
```

If you need to run steps manually, use `docs/03_DEPLOYMENT_RUNBOOK.md`.
