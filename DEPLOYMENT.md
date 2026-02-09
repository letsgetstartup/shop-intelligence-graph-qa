# ShopIntel Sovereign Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────┐
│              NVIDIA DGX Spark                    │
│                                                  │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │
│  │ Wizechat  │  │  Fastify  │  │ Local LLM   │ │
│  │ Frontend  │──│  Backend  │──│ (NIM/vLLM)  │ │
│  │  :3001    │  │   :8080   │  │   :8000     │ │
│  └───────────┘  └─────┬─────┘  └─────────────┘ │
│                       │                          │
│            ┌──────────┼──────────┐               │
│            │                     │               │
│  ┌─────────┴──┐       ┌─────────┴──┐            │
│  │ PostgreSQL │       │  FalkorDB  │            │
│  │   :5432    │       │   :6379    │            │
│  │  (SQL/KPI) │       │  (Graph)   │            │
│  └────────────┘       └────────────┘            │
└─────────────────────────────────────────────────┘
```

## Quick Start (Connected Mode)

```bash
# 1. Start infrastructure
docker compose -f docker-compose.local.yml up -d postgres falkordb

# 2. Wait for health checks
docker compose -f docker-compose.local.yml exec postgres pg_isready -U shop_user

# 3. Build and start backend + frontend
docker compose -f docker-compose.local.yml up -d --build

# 4. Run data ingestion
docker compose -f docker-compose.local.yml exec backend node ingest/ingest.cjs
bash scripts/load-postgres-data.sh

# 5. Run acceptance tests
bash scripts/acceptance-tests.sh
```

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/ping` | GET | Health check (includes LLM status) |
| `/testdb` | GET | Database connectivity test |
| `/query` | POST | Natural language → Cypher (LLM + fallback) |
| `/queryweaver/query` | POST | Template-based hybrid SQL+Cypher |
| `/graph/raw` | POST | Graph visualization data |

## Port Mapping (Local Development)

| Service | Internal | Host |
|---|---|---|
| Frontend | 80 | 3001 |
| Backend | 8080 | 8090 |
| PostgreSQL | 5432 | 5433 |
| FalkorDB | 6379 | 6380 |
| FalkorDB Browser | 3000 | 3002 |

## Data Sources

### PostgreSQL (25 tables)
- `shop.jb_*` — ERP data (Jobs, Operations, Customers, Parts, Employees, etc.)
- `shop.kg_*` — Tooling data (ToolMaster, Assemblies, Inventory, Magazines, NC Programs)
- `core.*` — Normalized views for QueryWeaver SQL templates
- `qw.*` — QueryWeaver semantic views
- `graph_export.*` — Graph projection views

### FalkorDB Graph (5,562 nodes)
- Node types: Customer, Part, Job, Machine, Employee, Operation, Cluster
- Relationships: PLACED, PRODUCES, HAS_OPERATION, USES_MACHINE, WORKED_ON, HAS_CLUSTER, IN_CLUSTER

## QueryWeaver Routes

| Route ID | Strategy | Trigger Words |
|---|---|---|
| `missing_tools_next_shift` | sql_then_graph | "missing", "next shift" |
| `blocked_operations_missing_tools` | sql_only | "blocked", "missing", "tool" |
| `tool_usage_for_job` | hybrid | "tool usage", "job" |
| `machines_loaded_magazine` | sql_only | "machines", "loaded", "magazine" |
| `compare_nc_vs_required` | sql_only | "compare", "nc", "required" |

## Offline Operation

The system operates fully offline with these characteristics:
- **No internet required** after initial deployment
- **Fallback Cypher** generators handle queries when no LLM is present
- **Template-based routing** via QueryWeaver for structured queries
- **Audit trail** — every request logged to `/app/audit/` as JSONL

### Enabling GPU LLM (DGX Spark)

Uncomment the `llm` service in `docker-compose.local.yml` and set:
- `NGC_API_KEY` for initial model download
- After download, the model is cached and runs fully offline

## Offline Bundle

Build a portable bundle for air-gapped deployment:

```bash
bash scripts/build-offline-bundle.sh ./my_bundle
```

On the target DGX Spark:

```bash
# Load Docker images
for img in my_bundle/images/*.tar; do docker load < "$img"; done

# Deploy
cp my_bundle/config/docker-compose.local.yml .
docker compose -f docker-compose.local.yml up -d
```

## Acceptance Criteria (Siemens-grade)

- [x] All services start and self-heal on restart
- [x] Read-only SQL/Cypher enforcement
- [x] Input sanitization (length limits, write-operation rejection)
- [x] Audit trail for every query (append-only JSONL)
- [x] Deterministic fallback when LLM unavailable
- [x] Graph + SQL hybrid queries operational
- [x] Frontend accessible without internet
