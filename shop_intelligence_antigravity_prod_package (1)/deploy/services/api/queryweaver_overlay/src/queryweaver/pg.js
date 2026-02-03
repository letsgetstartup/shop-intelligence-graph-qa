import pg from "pg";
import { getLogger } from "./logger.js";
const { Pool } = pg;

export function createPgPool(postgresUrl, logger) {
  const log = getLogger(logger);
  if (!postgresUrl) throw new Error("POSTGRES_URL is required");
  const pool = new Pool({
    connectionString: postgresUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  pool.on("error", (err) => log.error({ err }, "Postgres pool error"));
  return pool;
}

export async function withSqlTimeout(pool, timeoutSeconds, fn) {
  const client = await pool.connect();
  try {
    const ms = Math.max(1, Number(timeoutSeconds)) * 1000;
    await client.query(`SET statement_timeout = ${ms}`);
    return await fn(client);
  } finally {
    client.release();
  }
}
