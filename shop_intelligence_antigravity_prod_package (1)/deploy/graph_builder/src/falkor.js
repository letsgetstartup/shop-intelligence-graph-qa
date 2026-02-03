import { createClient } from 'redis';
import { logger } from './logger.js';
import { config } from './config.js';

export async function createFalkorClient() {
  const client = createClient({ url: config.falkorUrl });

  client.on('error', (err) => {
    logger.error({ err }, 'FalkorDB (Redis) client error');
  });

  await client.connect();
  return client;
}

export async function graphQuery(client, graphName, cypher) {
  // FalkorDB supports RedisGraph-compatible command: GRAPH.QUERY <graph> <cypher>
  // --compact reduces payload size; safe for write queries too.
  try {
    const res = await client.sendCommand(['GRAPH.QUERY', graphName, cypher, '--compact']);
    return res;
  } catch (err) {
    logger.error({ err, cypher: cypher.slice(0, 5000) }, 'GRAPH.QUERY failed');
    throw err;
  }
}
