# Shop Intelligence – Production Deployment Package (GCP + Antigravity)

This package is designed so an execution agent (Antigravity) can deploy the full stack **online** without requiring Docker on the local laptop.

## What is deployed
- Postgres (canonical tables `shop.*`, views `core.*`, projections `graph_export.*`)
- QueryWeaver semantic views in `qw.*` (safe: does not overwrite `core.*`)
- FalkorDB (graph DB) + Browser UI (port 3000)
- Graph Builder (relational → graph projection)
- API (Fastify) with QueryWeaver integrated (built as a Docker image by cloning the GitHub repo and overlaying QueryWeaver v2)

## Quick start (on a Linux VM with Docker)
```bash
./bin/bootstrap.sh
./bin/validate.sh
```

## Files
- `deploy/docker-compose.prod.yml` – production compose (no public Postgres/Redis ports)
- `deploy/db/migrations/*` – Flyway migrations (from the original Excel-derived package)
- `deploy/queryweaver/db/migrations/V100__queryweaver_semantic_views.sql` – creates `qw.*`
- `deploy/services/api/` – builds the API image with QueryWeaver v2 overlay
- `bin/` – bootstrap + validation scripts
- `docs/ANTIGRAVITY_DEPLOY_PROMPT.md` – copy/paste prompt for agents

## Notes
- The graph UI is available at port 3000 when exposed.
- For stricter security, restrict port 3000 firewall to your office IP only and keep 6379 closed publicly.
