import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import queryweaverPlugin from "../src/queryweaver/plugin.js";

function env(name, fallback) {
  return process.env[name] || fallback;
}

test("QueryWeaver: missing tools next shift (SQL)", async () => {
  const app = Fastify({ logger: false });

  await app.register(queryweaverPlugin, {
    configPath: env("QUERYWEAVER_CONFIG_PATH", "./config/queryweaver.config.json"),
    postgresUrl: env("POSTGRES_URL", "postgresql://shop_user:shop_pass@localhost:5432/shop"),
    falkorUrl: env("FALKOR_URL", "redis://localhost:6379"),
    graphName: env("GRAPH_NAME", "shop")
  });

  const res = await app.inject({
    method: "POST",
    url: "/queryweaver/query",
    payload: {
      question: "What tools are missing for the next shift per machine?",
      params: { shift_name: "NEXT" }
    }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.route, "missing_tools_next_shift");
  assert.ok(Array.isArray(body.data));
});

test("QueryWeaver: machines loaded magazine (SQL)", async () => {
  const app = Fastify({ logger: false });

  await app.register(queryweaverPlugin, {
    configPath: env("QUERYWEAVER_CONFIG_PATH", "./config/queryweaver.config.json"),
    postgresUrl: env("POSTGRES_URL", "postgresql://shop_user:shop_pass@localhost:5432/shop"),
    falkorUrl: env("FALKOR_URL", "redis://localhost:6379"),
    graphName: env("GRAPH_NAME", "shop")
  });

  const res = await app.inject({
    method: "POST",
    url: "/queryweaver/query",
    payload: { question: "Show machines and their loaded assemblies (magazine snapshot)." }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.route, "machines_loaded_magazine");
  assert.ok(Array.isArray(body.data));
});
