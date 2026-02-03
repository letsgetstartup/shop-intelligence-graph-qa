# Patch `src/server.js` (Fastify) — QueryWeaver Integration

Add the following **before** `fastify.listen()`:

```js
import queryweaverPlugin from "./queryweaver/plugin.js";

await fastify.register(queryweaverPlugin, {
  configPath: process.env.QUERYWEAVER_CONFIG_PATH || "./config/queryweaver.config.json",
  postgresUrl: process.env.POSTGRES_URL || "postgresql://shop_user:shop_pass@postgres:5432/shop",
  falkorUrl: process.env.FALKOR_URL || "redis://falkordb:6379",
  graphName: process.env.GRAPH_NAME || "shop"
});
```
