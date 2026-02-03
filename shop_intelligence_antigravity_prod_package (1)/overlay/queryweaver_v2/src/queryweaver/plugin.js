import fp from "fastify-plugin";
import { z } from "zod";
import { createQueryWeaver } from "./index.js";
import { getLogger } from "./logger.js";

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

  fastify.addHook("onClose", async () => {
    await qw.close();
  });
});
