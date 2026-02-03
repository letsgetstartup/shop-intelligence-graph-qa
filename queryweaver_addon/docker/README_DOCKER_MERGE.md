# Docker Compose Merge Instructions

Use `docker/docker-compose.queryweaver.additions.yml` as a merge reference.

If Postgres/Flyway are missing in your root compose, add:
- services: `postgres`, `flyway`
- volume: `pgdata`

If you already have Postgres/Flyway, do not duplicate.
Ensure:
- service name `postgres`
- db `shop`
- user/pass `shop_user` / `shop_pass`
- API env vars set:
  - POSTGRES_URL=postgresql://shop_user:shop_pass@postgres:5432/shop
  - FALKOR_URL=redis://falkordb:6379
  - GRAPH_NAME=shop
  - QUERYWEAVER_CONFIG_PATH=./config/queryweaver.config.json (or container path)
