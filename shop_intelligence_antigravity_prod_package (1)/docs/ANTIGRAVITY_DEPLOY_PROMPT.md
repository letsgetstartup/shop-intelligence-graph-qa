# Antigravity Execution Prompt (Production Best Practice)

You are an execution agent. The goal is to deploy Shop Intelligence (Postgres + FalkorDB + Graph UI + API + QueryWeaver) **online on Google Cloud**.

## Inputs
You have a deployment package folder (this repo folder) that contains:
- `deploy/docker-compose.prod.yml`
- `deploy/db/migrations/*` (Flyway migrations for shop/core/graph_export)
- `deploy/queryweaver/db/migrations/V100__queryweaver_semantic_views.sql` (creates `qw.*` semantic views)
- `deploy/scripts/load_excel_to_postgres.py` and `deploy/solidcam_graph_simulated_production.xlsx`
- `deploy/graph_builder/*` (Graph Builder that reads `graph_export.*` and writes FalkorDB)
- `deploy/services/api/*` (Dockerfile that clones `shop-intelligence-graph-qa` and overlays QueryWeaver v2)

## Constraints / Best Practices
- Do NOT require Docker on the user's local machine.
- Deploy on a GCE VM (Ubuntu 22.04).
- Do NOT expose Postgres (5432) or FalkorDB Redis port (6379) publicly.
- Optionally expose FalkorDB Browser UI (3000) publicly, but prefer restricting source IPs.
- Expose API publicly (3001).

## Step-by-step (do not skip validations)

### 1) Provision VM
- Create a VM `e2-standard-4` (or bigger) in the requested region/zone.
- Open firewall:
  - 22 (SSH) from admin IPs
  - 3001 (API) from allowed networks (0.0.0.0/0 acceptable for MVP)
  - 3000 (Graph UI) from admin IPs only (recommended)

### 2) Install runtime
On the VM:
- Install docker + docker compose plugin
- Install python3 + venv + pip
- Install git + unzip
Verify:
- `docker compose version` works

### 3) Copy this deployment package to the VM
Place under:
- `/opt/shop-intelligence/antigravity_deploy`

Verify:
- `/opt/shop-intelligence/antigravity_deploy/deploy/docker-compose.prod.yml` exists

### 4) Run bootstrap
From VM:
```bash
cd /opt/shop-intelligence/antigravity_deploy
./bin/bootstrap.sh
```

### 5) Validate
```bash
./bin/validate.sh
```

### 6) Deliver URLs
Return:
- API URL: `http://<VM_IP>:3001`
- Graph UI URL: `http://<VM_IP>:3000` (if exposed)

Also return:
- `docker ps`
- schema counts
- key row counts
- `GRAPH.LIST` and label counts
- output of QueryWeaver smoke test

## Troubleshooting rules
- If Flyway fails: show logs and stop. Do NOT guess.
- If Excel loader fails: show Python stack trace and stop.
- If graph builder fails: show logs and stop.
- If API fails: show container logs and stop.
