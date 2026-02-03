# Conversation Notes (Summary)

## Primary goal
Implement next-shift tooling readiness and planning using a knowledge graph:
- Combine job operations (ERP/MES) with tool requirements (SolidCAM, NC), current machine magazine, tool crib inventory, and consumption/burn events.
- Provide deterministic outputs: missing tools, pick lists, load plans, and predicted burn.

## Artifacts delivered
- A simulated, production-like dataset (Excel) for immediate end-to-end testing.
- A database-first package (Postgres + Flyway + FalkorDB + Graph Builder) that:
  - mirrors Excel sheets in SQL tables
  - produces stable `graph_export.*` node/edge feeds
  - rebuilds a FalkorDB graph deterministically
- An execution runbook and agent prompt to make deployment reproducible.
