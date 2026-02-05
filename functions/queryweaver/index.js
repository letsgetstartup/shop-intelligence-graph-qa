import fs from "node:fs";
import path from "node:path";
import { getLogger } from "./logger.js";
import { createPgPool, withSqlTimeout } from "./pg.js";
import { createFalkorClient, graphQuery } from "./graph.js";
import { enforceMaxRows } from "./guards.js";
import { SQL_TEMPLATES } from "./sql_templates.js";
import { CYPHER_TEMPLATES } from "./cypher_templates.js";
import { chooseRoute, normalizeJobNum, normalizeShiftName } from "./router.js";

function loadConfig(configPath) {
  const p = path.resolve(configPath);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function createQueryWeaver(opts) {
  const { configPath, postgresUrl, falkorUrl, graphName, logger } = opts;
  const log = getLogger(logger);
  const config = loadConfig(configPath);

  const pool = createPgPool(postgresUrl, log);
  const redis = createFalkorClient(falkorUrl, log);

  const limits = config.service || {};
  const routingRules = config.routing || [];

  async function sqlQuery(sql, params = []) {
    const maxRows = Number(limits.maxSqlRows || 1000);
    const timeoutSeconds = Number(limits.sqlTimeoutSeconds || 10);
    const finalSql = enforceMaxRows(sql, maxRows);

    return withSqlTimeout(pool, timeoutSeconds, async (client) => {
      const started = Date.now();
      const res = await client.query(finalSql, params);
      log.info({ kind: "sql", ms: Date.now() - started, rows: res.rowCount }, "queryweaver.sql.ok");
      return res.rows;
    });
  }

  async function cypherQuery(cypher) {
    const timeoutMs = Number(limits.graphTimeoutMs || 5000);
    const started = Date.now();
    const res = await graphQuery(redis, graphName, cypher, timeoutMs);
    log.info({ kind: "cypher", ms: Date.now() - started }, "queryweaver.cypher.ok");
    return res;
  }

  async function handle(question, params = {}) {
    const route = chooseRoute(question, routingRules, params);
    const strategy = route.strategy;

    log.info({ route: route.id, strategy }, "queryweaver.route.selected");

    if (strategy === "sql_only") {
      const tpl = SQL_TEMPLATES[route.sqlTemplate];
      if (!tpl) throw new Error(`Missing SQL template: ${route.sqlTemplate}`);

      const shiftName = normalizeShiftName(params);
      const jobNum = normalizeJobNum(params, question);

      let rows;
      if (route.sqlTemplate === "missing_tools_next_shift") {
        rows = await sqlQuery(tpl, [shiftName]);
      } else if (route.sqlTemplate === "tool_usage_for_job") {
        if (!jobNum) throw new Error("Missing required param: job_num");
        rows = await sqlQuery(tpl, [jobNum]);
      } else {
        rows = await sqlQuery(tpl, []);
      }

      return { route: route.id, strategy, data: rows };
    }

    if (strategy === "hybrid") {
      const jobNum = normalizeJobNum(params, question);
      if (!jobNum) throw new Error("Missing required param: job_num");

      const sqlRows = await sqlQuery(SQL_TEMPLATES[route.sqlTemplate], [jobNum]);
      const safeJob = jobNum.replace(/[^a-zA-Z0-9_\-]/g, "");
      const cypher = CYPHER_TEMPLATES[route.cypherTemplate](safeJob);
      const graphRes = await cypherQuery(cypher);

      return { route: route.id, strategy, sql: sqlRows, graph: graphRes };
    }

    if (strategy === "sql_then_graph_optional") {
      const shiftName = normalizeShiftName(params);
      const sqlRows = await sqlQuery(SQL_TEMPLATES[route.sqlTemplate], [shiftName]);

      const ids = [...new Set(sqlRows.map((r) => Number(r.assembly_id)).filter(Number.isFinite))];
      let alternates = null;

      if (ids.length && CYPHER_TEMPLATES[route.cypherTemplate]) {
        const maxDepth = Math.min(Number(limits.maxGraphDepth || 3), 3);
        const csv = ids.slice(0, 200).join(",");
        const cypher = CYPHER_TEMPLATES[route.cypherTemplate](csv, Math.min(maxDepth, 1));
        try {
          alternates = await cypherQuery(cypher);
        } catch (e) {
          log.warn({ err: String(e?.message || e) }, "queryweaver.optional.graph.failed");
        }
      }

      return { route: route.id, strategy, data: sqlRows, alternates };
    }

    throw new Error(`Unsupported strategy: ${strategy}`);
  }

  async function close() {
    await pool.end();
    redis.disconnect();
  }

  return { handle, close, config };
}
