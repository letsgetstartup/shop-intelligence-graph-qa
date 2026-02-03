import pg from 'pg';
import { logger } from './logger.js';
import { config } from './config.js';

export function createPgPool() {
  const pool = new pg.Pool({
    connectionString: config.postgresUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Postgres pool error');
  });

  return pool;
}

export async function queryAll(pool, sql) {
  const res = await pool.query(sql);
  return res.rows;
}
