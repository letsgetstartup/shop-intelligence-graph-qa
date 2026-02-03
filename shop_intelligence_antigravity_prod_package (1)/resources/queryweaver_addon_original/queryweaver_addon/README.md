# QueryWeaver Add-on (Postgres + FalkorDB) — Production-Ready Integration Pack

This pack adds **QueryWeaver** (hybrid SQL + Cypher router) to the existing **shop-intelligence-graph-qa** repository.

It assumes:
- **Fastify API** entrypoint: `src/server.js`
- **Graph DB**: FalkorDB (Redis protocol) with a populated graph named `shop` (configurable)
- **SQL DB**: Postgres (service name `postgres` inside Docker, localhost outside)

## What you get
- `src/queryweaver/` — QueryWeaver implementation (Node.js)
- `src/queryweaver/plugin.js` — Fastify plugin (adds `/queryweaver/query` endpoint)
- `config/queryweaver.config.json` — routing rules + hints
- `docker/docker-compose.queryweaver.additions.yml` — Postgres + Flyway additions + env wiring
- `db/migrations/V100__queryweaver_semantic_views.sql` — semantic views used by QueryWeaver
- `tests/queryweaver.acceptance.test.js` — automated acceptance tests
- `docs/AGENT_PROMPT.md` — exact prompt to run end-to-end in Antigravity

## Endpoint
`POST /queryweaver/query`

Body:
```json
{"question":"What tools are missing for the next shift per machine?","params":{"shift_name":"NEXT"}}
```
