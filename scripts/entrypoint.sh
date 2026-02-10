#!/bin/sh
set -e
# =============================================================================
# PRODUCTION entrypoint: auto-init data, warm LLM, then start server.
# Designed for DGX Spark (ARM64) with large models (70B+).
# =============================================================================

MODEL_ID="${LLM_MODEL_ID:-llama3.1:70b}"
LLM_BASE="${OPENAI_BASE_URL:-http://llm:11434/v1}"
GRAPH="${GRAPH_NAME:-shop}"

echo "[entrypoint] ================================================"
echo "[entrypoint] ShopIntel Production Entrypoint"
echo "[entrypoint] Model: $MODEL_ID"
echo "[entrypoint] LLM:   $LLM_BASE"
echo "[entrypoint] Graph: $GRAPH"
echo "[entrypoint] Arch:  $(uname -m)"
echo "[entrypoint] ================================================"

# ─── Step 1: Wait for FalkorDB and auto-ingest if empty ───
echo "[entrypoint] Waiting for FalkorDB..."
for i in $(seq 1 60); do
  if node -e "
    const Redis = require('ioredis');
    const r = new Redis(process.env.FALKORDB_URL || 'redis://falkordb:6379', {connectTimeout:2000});
    r.ping().then(()=>{r.disconnect();process.exit(0)}).catch(()=>process.exit(1));
  " 2>/dev/null; then
    echo "[entrypoint] FalkorDB ready."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[entrypoint] WARNING: FalkorDB not reachable after 120s. Continuing anyway..."
  fi
  sleep 2
done

NODE_COUNT=$(node -e "
  const Redis = require('ioredis');
  const r = new Redis(process.env.FALKORDB_URL || 'redis://falkordb:6379', {connectTimeout:3000});
  r.call('GRAPH.QUERY','${GRAPH}','MATCH (n) RETURN count(n) as c').then(d=>{
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

# ─── Step 2: Pre-warm LLM (extended timeout for large models on DGX Spark) ───
echo "[entrypoint] Pre-warming LLM ($MODEL_ID)..."
echo "[entrypoint] Large models (70B+) may take 60-120s to load into GPU memory."
LLM_WARM=false
for i in $(seq 1 60); do
  if curl -sf "${LLM_BASE}/models" >/dev/null 2>&1; then
    if [ "$LLM_WARM" = "false" ]; then
      echo "[entrypoint] LLM endpoint reachable. Sending warmup request..."
    fi
    # Send a warmup request to load model into GPU memory
    WARM_RESULT=$(curl -sf -X POST "${LLM_BASE}/chat/completions" \
      -H "Content-Type: application/json" \
      -d "{\"model\":\"${MODEL_ID}\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in one word.\"}],\"temperature\":0,\"max_tokens\":10}" \
      --max-time 120 2>/dev/null || echo "")
    if echo "$WARM_RESULT" | grep -q "choices"; then
      echo "[entrypoint] LLM model loaded and warm. Ready for inference."
      LLM_WARM=true
      break
    fi
    echo "[entrypoint] LLM still loading model... ($i/60)"
  else
    echo "[entrypoint] Waiting for LLM endpoint... ($i/60)"
  fi
  sleep 3
done

if [ "$LLM_WARM" = "false" ]; then
  echo "[entrypoint] WARNING: LLM not warm after 3 minutes. Server will start but queries may fail initially."
fi

# ─── Step 3: Start server ───
echo "[entrypoint] Starting PRODUCTION server..."
exec node src/server.js
