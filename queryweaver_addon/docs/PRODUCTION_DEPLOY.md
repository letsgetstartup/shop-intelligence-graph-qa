# End-to-End Production Deployment (Copy/Paste)

1) Copy files into repo (from this add-on pack):
- `src/queryweaver/`
- `config/queryweaver.config.json`
- `db/migrations/V100__queryweaver_semantic_views.sql`
- `tests/queryweaver.acceptance.test.js`
- docs (optional)

2) Install dependencies:
```bash
npm i pg ioredis zod
```

3) Ensure Postgres is running (your Postgres container is currently down):
```bash
docker compose up -d postgres falkordb
docker compose run --rm flyway
```

4) Patch `src/server.js` as per `docs/SERVER_PATCH.md`.

5) Run tests:
```bash
export POSTGRES_URL='postgresql://shop_user:shop_pass@postgres:5432/shop'
export FALKOR_URL='redis://falkordb:6379'
export GRAPH_NAME='shop'
export QUERYWEAVER_CONFIG_PATH='./config/queryweaver.config.json'
npm test
```

6) Smoke test (adjust API port):
```bash
curl -s -X POST http://localhost:3001/queryweaver/query -H 'content-type: application/json'   -d '{"question":"What tools are missing for the next shift per machine?","params":{"shift_name":"NEXT"}}'
```
