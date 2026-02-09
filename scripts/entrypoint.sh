#!/bin/sh
set -e
# PRODUCTION entrypoint: auto-init data, warm LLM, then start server

# ─── Step 1: Always check and initialize graph data ───
echo "[entrypoint] Checking FalkorDB data..."

echo "[entrypoint] Waiting for FalkorDB..."
for i in $(seq 1 30); do
  if node -e "
    const Redis = require('ioredis');
    const r = new Redis(process.env.FALKORDB_URL || 'redis://falkordb:6379', {connectTimeout:2000});
    r.ping().then(()=>{r.disconnect();process.exit(0)}).catch(()=>process.exit(1));
  " 2>/dev/null; then
    echo "[entrypoint] FalkorDB ready."
    break
  fi
  sleep 2
done

NODE_COUNT=$(node -e "
  const Redis = require('ioredis');
  const r = new Redis(process.env.FALKORDB_URL || 'redis://falkordb:6379', {connectTimeout:3000});
  r.call('GRAPH.QUERY','shop','MATCH (n) RETURN count(n) as c').then(d=>{
    const c = d && d[1] && d[1][0] && d[1][0][0];
    console.log(c || '0');
    r.disconnect();
  }).catch(()=>{console.log('0');r.disconnect();});
" 2>/dev/null || echo "0")

if [ "$NODE_COUNT" = "0" ] || [ -z "$NODE_COUNT" ]; then
  echo "[entrypoint] Graph is empty ($NODE_COUNT nodes). Running ingestion..."
  node ingest/ingest.cjs 2>&1
  echo "[entrypoint] Graph ingestion complete."
else
  echo "[entrypoint] Graph has $NODE_COUNT nodes. OK."
fi

# ─── Step 2: Pre-warm LLM ───
echo "[entrypoint] Pre-warming LLM..."
LLM_BASE="${OPENAI_BASE_URL:-http://llm:11434/v1}"
for i in $(seq 1 30); do
  if curl -sf "${LLM_BASE}/models" >/dev/null 2>&1; then
    echo "[entrypoint] LLM endpoint reachable."
    # Send a warmup request to load model into memory
    curl -sf -X POST "${LLM_BASE}/chat/completions" \
      -H "Content-Type: application/json" \
      -d "{\"model\":\"${LLM_MODEL_ID:-llama3.2}\",\"messages\":[{\"role\":\"user\",\"content\":\"MATCH (n) RETURN count(n)\"}],\"temperature\":0,\"max_tokens\":20}" \
      >/dev/null 2>&1 && echo "[entrypoint] LLM model loaded and warm." && break
    echo "[entrypoint] LLM warming... ($i)"
  else
    echo "[entrypoint] Waiting for LLM... ($i/30)"
  fi
  sleep 3
done

# ─── Step 3: Start server ───
echo "[entrypoint] Starting PRODUCTION server..."
exec node src/server.js
