import Redis from "ioredis";
import { getLogger } from "./logger.js";
import { safeGraphName } from "./guards.js";

export function createFalkorClient(falkorUrl, logger) {
  const log = getLogger(logger);
  if (!falkorUrl) throw new Error("FALKOR_URL is required");
  const redis = new Redis(falkorUrl, { maxRetriesPerRequest: 2, enableReadyCheck: true });
  redis.on("error", (err) => log.error({ err }, "FalkorDB client error"));
  return redis;
}

export async function graphQuery(redis, graphName, cypher, timeoutMs) {
  const g = safeGraphName(graphName);
  const p = redis.call("GRAPH.QUERY", g, cypher);
  const t = new Promise((_, reject) =>
    setTimeout(() => reject(Object.assign(new Error("Graph query timeout"), { code: "GRAPH_TIMEOUT" })), timeoutMs)
  );
  return Promise.race([p, t]);
}
