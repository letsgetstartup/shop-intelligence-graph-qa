import 'dotenv/config';

function required(name, fallback = null) {
  const v = process.env[name] ?? fallback;
  if (v === null || v === undefined || String(v).trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const config = {
  postgresUrl: required('POSTGRES_URL'),
  falkorUrl: required('FALKOR_URL'),
  graphName: process.env.GRAPH_NAME || 'shop_intelligence',
  mode: (process.env.MODE || 'full_rebuild').toLowerCase(),
  batchSize: Number(process.env.BATCH_SIZE || 200),
  logLevel: process.env.LOG_LEVEL || 'info',
};
