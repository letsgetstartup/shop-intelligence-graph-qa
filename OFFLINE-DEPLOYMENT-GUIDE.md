# ShopIntel Offline Deployment Guide: NVIDIA DGX Spark

> **Industry-Grade Air-Gapped Deployment for Manufacturing Intelligence**

This document provides complete step-by-step instructions for deploying the ShopIntel platform on an NVIDIA DGX Spark in a fully offline (air-gapped) environment. After initial bundle creation on a connected machine, **no internet access is required**.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Prerequisites](#2-prerequisites)
3. [Phase 1: Build the Offline Bundle (Connected Machine)](#3-phase-1-build-the-offline-bundle)
4. [Phase 2: Transfer to DGX Spark](#4-phase-2-transfer-to-dgx-spark)
5. [Phase 3: Deploy on DGX Spark](#5-phase-3-deploy-on-dgx-spark)
6. [Phase 4: Verification](#6-phase-4-verification)
7. [Phase 5: Production Hardening](#7-phase-5-production-hardening)
8. [Operations Runbook](#8-operations-runbook)
9. [Troubleshooting](#9-troubleshooting)
10. [Architecture Reference](#10-architecture-reference)

---

## 1. System Overview

### What is ShopIntel?

ShopIntel is a manufacturing intelligence platform that provides natural language access to shop-floor data. It combines:

- **FalkorDB**: Graph database for relational manufacturing data (Jobs, Parts, Machines, Customers, Operations)
- **PostgreSQL**: Relational database for structured ERP data, KPIs, and tooling information
- **QueryWeaver**: Hybrid SQL+Cypher router that intelligently routes questions to the right data source
- **Ollama LLM**: Local large language model for natural language to query translation
- **Wizechat Frontend**: Web UI for interactive Q&A

### What Makes It Offline?

- All Docker images pre-built and bundled as tarballs
- LLM model pre-downloaded (no Ollama pull at runtime)
- All npm dependencies vendored in container images
- Manufacturing data (CSVs) bundled for ingestion
- SQL migrations run via `psql` (no Flyway JVM dependency)
- Zero external API calls (`OFFLINE_ONLY=true`)

### Target Hardware

| Spec | Value |
|------|-------|
| Device | NVIDIA DGX Spark |
| CPU | Grace (ARM64 / aarch64) |
| GPU | GB10 Blackwell |
| Memory | 128GB unified |
| OS | DGX OS (Ubuntu-based) |
| AI Performance | 1 petaFLOP |

---

## 2. Prerequisites

### 2.1 Build Machine (Connected, Any Architecture)

- [ ] Docker 24.0+ with `buildx` (multi-arch support)
- [ ] Internet access
- [ ] 60GB free disk space
- [ ] Git + Git LFS installed
- [ ] Python 3.8+ (for manifest generation)

### 2.2 DGX Spark (Target, Air-Gapped)

- [ ] DGX OS installed and booted
- [ ] Docker + Docker Compose v2 pre-installed (included with DGX OS)
- [ ] NVIDIA Container Toolkit pre-installed (included with DGX OS)
- [ ] `nvidia-smi` working (verify GPU)
- [ ] SSH access configured
- [ ] 50GB free disk space on `/opt` or target directory
- [ ] Network link between build machine and DGX Spark (for bundle transfer)

### 2.3 Verification Commands (Run on DGX Spark)

```bash
# Architecture
uname -m
# Expected: aarch64

# GPU
nvidia-smi
# Expected: Shows GB10 GPU

# Docker
docker --version
docker compose version

# NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

---

## 3. Phase 1: Build the Offline Bundle

Run ALL steps in this phase on a **connected machine** with Docker and internet access.

### 3.1 Clone the Repository

```bash
git lfs install
git clone https://github.com/letsgetstartup/shop-intelligence-graph-qa.git
cd shop-intelligence-graph-qa
```

### 3.2 Build the Bundle

```bash
bash scripts/build-offline-bundle.sh shopintel-dgx-bundle
```

This script will:
1. Pull all Docker images for ARM64
2. Build backend and frontend application images
3. Download the LLM model (`llama3.1:70b` by default, ~40GB)
4. Copy configuration files, migrations, and data
5. Generate SHA-256 checksums for integrity verification

**Estimated time**: 30-90 minutes (depending on model size and internet speed).

**Custom model**: To use a different model:
```bash
LLM_MODEL=mixtral:8x7b bash scripts/build-offline-bundle.sh shopintel-dgx-bundle
```

### 3.3 Verify the Bundle

```bash
ls -lh shopintel-dgx-bundle/
# Expected directories: images/ models/ config/ data/ db/ scripts/ systemd/ manifest/

# Check manifest
cat shopintel-dgx-bundle/manifest/manifest.json | python3 -m json.tool | head -10
```

### 3.4 Bundle Contents

| Directory | Contents | Approx. Size |
|-----------|----------|-------------|
| `images/` | Docker image tarballs (ARM64) | 2-5 GB |
| `models/` | Ollama model data (llama3.1:70b) | 35-45 GB |
| `config/` | Compose files, .env, QueryWeaver config | < 1 MB |
| `data/` | Manufacturing CSV datasets | < 50 MB |
| `db/migrations/` | SQL migration files | < 1 MB |
| `scripts/` | Deploy, verify, backup, migrate scripts | < 100 KB |
| `systemd/` | Systemd service unit | < 1 KB |
| `manifest/` | SHA-256 checksums | < 100 KB |

---

## 4. Phase 2: Transfer to DGX Spark

### 4.1 Via rsync (Recommended)

```bash
rsync -avP --progress shopintel-dgx-bundle/ user@dgx-spark:/opt/shopintel/
```

### 4.2 Via Physical Media

For fully air-gapped environments:

```bash
# On build machine: create tarball
tar czf shopintel-dgx-bundle.tar.gz shopintel-dgx-bundle/

# Transfer to USB drive or SSD
cp shopintel-dgx-bundle.tar.gz /media/usb/

# On DGX Spark: extract
sudo mkdir -p /opt/shopintel
sudo tar xzf /media/usb/shopintel-dgx-bundle.tar.gz -C /opt/ --strip-components=1
sudo chown -R $USER:$USER /opt/shopintel
```

### 4.3 Verify Integrity After Transfer

```bash
cd /opt/shopintel
sha256sum -c manifest/sha256sum.txt 2>&1 | grep -c "OK"
# Should match the total file count
```

---

## 5. Phase 3: Deploy on DGX Spark

### 5.1 Automated Deployment (Recommended)

```bash
cd /opt/shopintel
bash scripts/deploy-offline.sh
```

This script will:
1. Run pre-flight checks (architecture, Docker, GPU)
2. Verify bundle integrity
3. Load Docker images from tarballs
4. Restore LLM model to Docker volume
5. Set up configuration files
6. Start all services (Postgres, FalkorDB, Ollama, Backend, Frontend)
7. Apply SQL migrations
8. Wait for services to be healthy
9. Install systemd service for auto-start on boot

### 5.2 Manual Deployment (Step by Step)

If you prefer manual control:

```bash
cd /opt/shopintel

# 1. Load Docker images
for img in images/*.tar; do
    echo "Loading $img..."
    docker load -i "$img"
done

# 2. Restore LLM model
docker volume create shopintel-dgx-spark_ollama_data
docker run --rm \
    -v shopintel-dgx-spark_ollama_data:/target \
    -v $(pwd)/models:/backup:ro \
    alpine sh -c "cd /target && tar xzf /backup/ollama-models.tar.gz"

# 3. Copy config files
cp config/docker-compose.local.yml ./
cp config/docker-compose.dgx-spark.yml ./
cp config/.env ./

# 4. Start infrastructure
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml up -d postgres falkordb llm

# 5. Wait for Postgres to be ready
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec postgres pg_isready -U shop_user -d shop

# 6. Start application
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml up -d

# 7. Check status
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml ps
```

### 5.3 Pull Additional Models (Optional)

If you want extra models after deployment:

```bash
# List available models
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec llm ollama list

# Pull additional models (requires temporary internet or pre-bundled)
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec llm ollama pull llama3.1:8b
```

---

## 6. Phase 4: Verification

### 6.1 Run the 13-Gate Verification Script

```bash
bash scripts/verify-dgx-spark-shopintel.sh
```

Expected output (all gates should PASS):

```
============================================================
 ShopIntel DGX Spark Verification (13 Gates)
============================================================

--- Gate 1: Architecture ---
  [PASS] Running on ARM64 (aarch64)
--- Gate 2: NVIDIA GPU ---
  [PASS] NVIDIA GPU detected: NVIDIA GB10 (128GB)
--- Gate 3: Docker + Compose ---
  [PASS] Docker installed
  [PASS] Docker Compose available
--- Gate 4: Container Status ---
  [PASS] Container running: postgres
  [PASS] Container running: falkordb
  [PASS] Container running: llm
  [PASS] Container running: backend
  [PASS] Container running: frontend
--- Gate 5: PostgreSQL ---
  [PASS] PostgreSQL is reachable
--- Gate 6: FalkorDB ---
  [PASS] FalkorDB is reachable (PING -> PONG)
--- Gate 7: FalkorDB Graph Data ---
  [PASS] FalkorDB graph has 5562 nodes
--- Gate 8: PostgreSQL Data ---
  [PASS] PostgreSQL has 25 tables in shop/core/qw schemas
--- Gate 9: LLM (Ollama) ---
  [PASS] Ollama API responding on port 11434
  [PASS] LLM model available: llama3.1:70b
--- Gate 10: Backend Health ---
  [PASS] Backend /ping responded (status: ok)
--- Gate 11: QueryWeaver ---
  [PASS] QueryWeaver /queryweaver/query responded successfully
--- Gate 12: Frontend ---
  [PASS] Frontend returning HTTP 200 on port 3001
--- Gate 13: End-to-End Query ---
  [PASS] End-to-end NL query succeeded (4523ms)

============================================================
 Verification Summary
============================================================
  PASS: 18
  FAIL: 0
  WARN: 0

RESULT: ALL GATES PASSED -- ShopIntel is production-ready on DGX Spark.
```

### 6.2 Manual Endpoint Tests

```bash
# Health check
curl http://localhost:8090/ping | python3 -m json.tool

# Database test
curl http://localhost:8090/testdb | python3 -m json.tool

# Natural language query (via LLM)
curl -X POST http://localhost:8090/query \
  -H "Content-Type: application/json" \
  -d '{"question":"How many active jobs are there?"}'

# QueryWeaver template query
curl -X POST http://localhost:8090/queryweaver/query \
  -H "Content-Type: application/json" \
  -d '{"question":"What tools are missing for the next shift?"}'

# QueryWeaver hybrid query (LLM-powered)
curl -X POST http://localhost:8090/queryweaver/hybrid \
  -H "Content-Type: application/json" \
  -d '{"question":"Which machines have the highest scrap rate this week?"}'

# Graph visualization
curl -X POST http://localhost:8090/graph/raw \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

### 6.3 Open the Frontend

Open a browser to: **http://dgx-spark-ip:3001**

The Wizechat UI should load and allow natural language queries.

---

## 7. Phase 5: Production Hardening

### 7.1 Enable Auto-Start on Boot

```bash
# Install systemd service
sudo cp systemd/shopintel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable shopintel.service

# Verify
sudo systemctl status shopintel.service

# Manual start/stop
sudo systemctl start shopintel
sudo systemctl stop shopintel
```

### 7.2 Configure Backup Cron

```bash
# Daily backup at 2 AM
sudo crontab -e
# Add:
0 2 * * * cd /opt/shopintel && bash scripts/backup.sh >> /var/log/shopintel-backup.log 2>&1
```

### 7.3 Install Audit Log Rotation

```bash
sudo cp config/logrotate-audit.conf /etc/logrotate.d/shopintel-audit
```

### 7.4 Security Checklist

- [x] **Read-only SQL**: Postgres connection uses `default_transaction_read_only=on`
- [x] **Read-only Cypher**: Write operations (`CREATE`, `MERGE`, `DELETE`, `SET`, `REMOVE`, `DROP`) are rejected at the application level
- [x] **Read-only SQL guards**: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE` rejected before execution
- [x] **Input sanitization**: Question length limited to 2000 characters
- [x] **SQL timeout**: 10-second statement timeout on all SQL queries
- [x] **Graph timeout**: 5-10 second timeout on Cypher queries
- [x] **Audit trail**: Every query logged to JSONL with full execution trace
- [x] **No external APIs**: `OFFLINE_ONLY=true` disables all external calls
- [x] **Container isolation**: All services run in Docker with no host network
- [x] **Auto-recovery**: All containers set to `restart: unless-stopped`

### 7.5 Firewall Rules (Recommended)

```bash
# Only expose frontend (3001) to the shop-floor network
sudo ufw allow from 10.0.0.0/8 to any port 3001 proto tcp
sudo ufw deny 8090  # Backend API (only via frontend proxy)
sudo ufw deny 5433  # Postgres
sudo ufw deny 6380  # FalkorDB
sudo ufw deny 11434 # Ollama

# Or restrict to specific subnet
sudo ufw allow from 192.168.1.0/24 to any port 3001 proto tcp
```

---

## 8. Operations Runbook

### 8.1 Service Management

```bash
# Status
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml ps

# Logs (all services)
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml logs -f

# Logs (specific service)
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml logs -f backend

# Restart a service
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml restart backend

# Full restart
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml down
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml up -d
```

### 8.2 Backup and Restore

```bash
# Create backup
bash scripts/backup.sh

# Restore PostgreSQL from backup
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec -T postgres \
    pg_restore -U shop_user -d shop --clean < backups/latest/postgres-shop.dump

# Restore FalkorDB from backup
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml down falkordb
docker volume rm shopintel-dgx-spark_falkordbdata
docker volume create shopintel-dgx-spark_falkordbdata
docker run --rm \
    -v shopintel-dgx-spark_falkordbdata:/target \
    -v $(pwd)/backups/latest:/backup:ro \
    alpine sh -c "cd /target && tar xzf /backup/falkordb-data.tar.gz"
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml up -d falkordb
```

### 8.3 Re-Ingest Data

If you need to reload manufacturing data:

```bash
# Clear FalkorDB graph
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec falkordb \
    redis-cli GRAPH.DELETE shop

# Restart backend (triggers auto-ingestion from entrypoint.sh)
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml restart backend
```

### 8.4 Change LLM Model

```bash
# Pull a different model (requires temporary internet or pre-bundled)
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec llm ollama pull mixtral:8x7b

# Update .env
echo "LLM_MODEL_ID=mixtral:8x7b" >> .env

# Restart backend to use new model
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml restart backend
```

### 8.5 GPU Monitoring

```bash
# Real-time GPU usage
nvidia-smi -l 1

# GPU memory usage (important for large models)
nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv -l 5
```

---

## 9. Troubleshooting

### Backend fails to start

**Symptom**: Backend container restarts repeatedly.

```bash
# Check logs
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml logs backend
```

**Common causes**:
- FalkorDB not ready: Backend waits 120s then continues. Check FalkorDB health.
- LLM not ready: Backend starts anyway, but queries will fail until warm.
- Postgres migrations not applied: Check if `__schema_version` table exists.

### LLM is slow or OOM

**Symptom**: Queries take > 60 seconds or Ollama container exits.

```bash
# Check GPU memory
nvidia-smi

# Check Ollama logs
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml logs llm
```

**Fix**: Switch to a smaller model:
```bash
# Edit .env
LLM_MODEL_ID=llama3.1:8b
# Restart
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml restart backend
```

### QueryWeaver returns errors

**Symptom**: `/queryweaver/query` returns 400/500.

```bash
# Test database connectivity
curl http://localhost:8090/testdb

# Check if Postgres has the core views
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec postgres \
    psql -U shop_user -d shop -c "SELECT schemaname, viewname FROM pg_views WHERE schemaname IN ('core','qw')"
```

**Fix**: Re-apply migrations:
```bash
POSTGRES_URL=postgresql://shop_user:shop_pass_local@localhost:5433/shop \
    bash scripts/apply-migrations.sh
```

### FalkorDB graph is empty

**Symptom**: Gate 7 fails (0 nodes).

```bash
# Re-run ingestion manually
docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec backend node ingest/ingest.cjs
```

### Flyway JVM crash on ARM64

**Symptom**: `SIGILL` or `Illegal instruction` from Flyway container.

**Fix**: This is a known issue with Flyway 10 on ARM64. Use the `scripts/apply-migrations.sh` script instead (already configured as the default in this deployment).

---

## 10. Architecture Reference

### Service Map

| Service | Image | Internal Port | Host Port | Purpose |
|---------|-------|--------------|-----------|---------|
| postgres | postgres:16-alpine | 5432 | 5433 | Relational data (ERP, KPIs, QueryWeaver views) |
| falkordb | falkordb/falkordb:latest | 6379 | 6380 | Graph database (Jobs, Parts, Machines) |
| llm | ollama/ollama:latest | 11434 | 11434 | Local LLM (Cypher + SQL generation) |
| backend | shopintel-backend:latest | 8080 | 8090 | Fastify API + QueryWeaver |
| frontend | shopintel-frontend:latest | 80 | 3001 | Wizechat web UI |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping` | GET | Health check (includes LLM, DB status) |
| `/testdb` | GET | Database connectivity test |
| `/query` | POST | Natural language -> Cypher via LLM |
| `/queryweaver/query` | POST | Template-based SQL+Cypher routing |
| `/queryweaver/hybrid` | POST | LLM-powered hybrid SQL+Cypher |
| `/graph/raw` | POST | Raw graph visualization data |

### QueryWeaver Routes

| Route ID | Strategy | Trigger Words |
|----------|----------|---------------|
| `missing_tools_next_shift` | sql_then_graph | "missing", "next shift" |
| `blocked_operations_missing_tools` | sql_only | "blocked", "missing", "tool" |
| `tool_usage_for_job` | hybrid | "tool usage", "job" |
| `machines_loaded_magazine` | sql_only | "machines", "loaded", "magazine" |
| `compare_nc_vs_required` | sql_only | "compare", "nc", "required" |

### Data Model

**FalkorDB Graph** (5,562 nodes):
- Node types: Customer, Part, Job, Machine, Employee, Operation, Cluster
- Relationships: PLACED, PRODUCES, HAS_OPERATION, USES_MACHINE, WORKED_ON, HAS_CLUSTER, IN_CLUSTER

**PostgreSQL** (25 tables):
- `shop.jb_*`: ERP data (Jobs, Operations, Customers, Parts, Employees)
- `shop.kg_*`: Tooling data (Assemblies, Inventory, Magazines, NC Programs)
- `core.*`: Normalized views for QueryWeaver
- `qw.*`: QueryWeaver semantic views

### Supported LLM Models (DGX Spark 128GB)

| Model | Size | Memory | Best For |
|-------|------|--------|----------|
| `llama3.1:70b` | 70B | ~40GB | Best Cypher quality (default) |
| `mixtral:8x7b` | 46.7B | ~26GB | Strong multi-task |
| `qwen2.5:32b` | 32B | ~18GB | Good multilingual |
| `mistral-nemo:12b` | 12B | ~7GB | Fast inference |
| `llama3.1:8b` | 8B | ~4.7GB | Ultra-fast, lower quality |

---

## Document Information

| Field | Value |
|-------|-------|
| Version | 2.0.0 |
| Last Updated | February 2026 |
| Target | NVIDIA DGX Spark (ARM64 / GB10) |
| Offline | Yes, fully air-gapped after bundle transfer |
| LLM Default | llama3.1:70b via Ollama |
| Data Sources | FalkorDB (graph) + PostgreSQL (SQL) |
| Query Router | QueryWeaver (template + LLM hybrid) |

---

**End of Offline Deployment Guide**
