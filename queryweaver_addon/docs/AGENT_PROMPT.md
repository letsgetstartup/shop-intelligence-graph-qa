# Antigravity Agent Prompt — End-to-End QueryWeaver Integration

Paste into Antigravity:

---

You are an execution agent. Integrate QueryWeaver into the repo:
`/home/g4aviram/cloudshell_open/shop-intelligence-graph-qa`

Goals:
- Add QueryWeaver code/config
- Ensure Postgres is running and migrations applied
- Patch `src/server.js`
- Install deps
- Run acceptance tests

Commands (fail fast, print logs):

```bash
cd /home/g4aviram/cloudshell_open/shop-intelligence-graph-qa

# 1) Validate docker
docker --version
docker compose version

# 2) Bring infra up
docker compose up -d postgres falkordb || true
docker compose ps
docker compose logs --tail=120 postgres || true

# 3) Apply migrations
docker compose run --rm flyway || true
docker compose logs --tail=200 flyway || true

# 4) Install deps
npm i pg ioredis zod

# 5) Patch server.js per docs/SERVER_PATCH.md

# 6) Run tests inside docker network env
export POSTGRES_URL='postgresql://shop_user:shop_pass@postgres:5432/shop'
export FALKOR_URL='redis://falkordb:6379'
export GRAPH_NAME='shop'
export QUERYWEAVER_CONFIG_PATH='./config/queryweaver.config.json'
npm test
```

---
