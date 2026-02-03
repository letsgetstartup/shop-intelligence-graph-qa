# Target Architecture (Database-first + Graph Projection)

## Core principles
1) **PostgreSQL is the System of Record**
- Strong constraints, auditability, joins, BI compatibility
- All source systems (ERP/MES, SolidCAM, tool crib, machine magazine, NC parsing) load into the canonical SQL contract.

2) **Graph is a derived projection (never authored)**
- FalkorDB graph is rebuilt or incrementally synced from Postgres.
- This keeps the graph deterministic, explainable, and safe to regenerate.

3) **Stable, explicit contract**
- Tables `shop."jb_*"` and `shop."kg_*"` mirror upstream exports / domain tables.
- `core.*` provides canonical naming and convenience views.
- `graph_export.*` provides stable node/edge feeds for the Graph Builder.

## Why this is production best practice
- Data quality and lineage remain in SQL (constraints + tests).
- Graph stays optimized for traversal and Cypher Q&A.
- Adding a new system later requires only a loader into the SQL contract; the graph mapping remains stable.
