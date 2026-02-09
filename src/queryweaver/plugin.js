import fp from "fastify-plugin";
import { z } from "zod";
import { createQueryWeaver } from "./index.js";
import { handleHybridQuery } from "./llm_hybrid.js";
import { getLogger } from "./logger.js";
import { createPgPool } from "./pg.js";
import { createFalkorClient } from "./graph.js";

const OptsSchema = z.object({
  configPath: z.string(),
  postgresUrl: z.string(),
  falkorUrl: z.string(),
  graphName: z.string()
});

export default fp(async function queryweaverPlugin(fastify, opts) {
  const parsed = OptsSchema.parse(opts);
  const log = getLogger(fastify.log);

  const qw = createQueryWeaver({
    configPath: parsed.configPath,
    postgresUrl: parsed.postgresUrl,
    falkorUrl: parsed.falkorUrl,
    graphName: parsed.graphName,
    logger: log
  });

  // Create shared connections for hybrid endpoint
  const pgPool = createPgPool(parsed.postgresUrl, log);
  const redisClient = createFalkorClient(parsed.falkorUrl, log);

  // ─── Template-based QueryWeaver (pre-approved SQL/Cypher) ───
  fastify.post("/queryweaver/query", async (request, reply) => {
    const body = request.body || {};
    const question = String(body.question || "");
    const params = body.params || {};

    const started = Date.now();
    try {
      const result = await qw.handle(question, params);
      log.info({ ms: Date.now() - started, route: result.route }, "queryweaver.request.ok");
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      log.error({ err, ms: Date.now() - started }, "queryweaver.request.failed");
      return reply.code(400).send({ ok: false, error: String(err?.message || err) });
    }
  });

  // ─── LLM-powered Hybrid SQL + Cypher (production) ───
  fastify.post("/queryweaver/hybrid", async (request, reply) => {
    const body = request.body || {};
    const question = String(body.question || "");

    if (!question || question.length < 3) {
      return reply.code(400).send({ ok: false, error: "Question too short" });
    }
    if (question.length > 2000) {
      return reply.code(400).send({ ok: false, error: "Question too long (max 2000)" });
    }

    const started = Date.now();
    try {
      const result = await handleHybridQuery({
        question,
        pgPool,
        redisClient,
        graphName: parsed.graphName
      });
      log.info({ ms: Date.now() - started, strategy: result.strategy }, "queryweaver.hybrid.ok");
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      log.error({ err, ms: Date.now() - started }, "queryweaver.hybrid.failed");
      return reply.code(500).send({ ok: false, error: String(err?.message || err) });
    }
  });

  fastify.addHook("onClose", async () => {
    await qw.close();
    await pgPool.end();
    redisClient.disconnect();
  });
});
