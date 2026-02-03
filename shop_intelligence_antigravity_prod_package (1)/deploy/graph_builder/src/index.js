import { config } from './config.js';
import { logger } from './logger.js';
import { createPgPool } from './postgres.js';
import { createFalkorClient } from './falkor.js';
import { runFullRebuild, runIncremental } from './builder.js';

async function main() {
  logger.info({ mode: config.mode, graphName: config.graphName }, 'Graph Builder starting');

  const pool = createPgPool();
  const falkor = await createFalkorClient();

  try {
    if (config.mode === 'full_rebuild') {
      await runFullRebuild(pool, falkor);
    } else if (config.mode === 'incremental') {
      await runIncremental(pool, falkor);
    } else {
      throw new Error(`Unknown MODE: ${config.mode}`);
    }
  } finally {
    await falkor.quit();
    await pool.end();
  }

  // In production, you typically run this as:
  // - a scheduled job (cron / k8s CronJob), OR
  // - a daemon that waits for outbox events.
  // Here we run once on container start.
  logger.info('Graph Builder finished (one-shot).');
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Graph Builder fatal error');
  process.exit(1);
});
