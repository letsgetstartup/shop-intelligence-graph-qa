#!/usr/bin/env bash
# =============================================================================
# ShopIntel DGX Spark Deployment Verification (13 Gates)
# Run after deployment to validate the entire stack is operational.
#
# Usage: bash scripts/verify-dgx-spark-shopintel.sh
# =============================================================================
set -e

PASS=0
FAIL=0
WARN=0

pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN + 1)); }

COMPOSE_CMD="docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml"

# Use the base compose only if DGX override doesn't exist
if [ ! -f "docker-compose.dgx-spark.yml" ]; then
    COMPOSE_CMD="docker compose -f docker-compose.local.yml"
fi

echo "============================================================"
echo " ShopIntel DGX Spark Verification (13 Gates)"
echo "============================================================"
echo "  Date:  $(date -Iseconds)"
echo "  Arch:  $(uname -m)"
echo ""

# ─── Gate 1: Architecture ───
echo "--- Gate 1: Architecture ---"
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
    pass "Running on ARM64 (aarch64)"
else
    warn "Not running on ARM64 (detected: $ARCH). This script is designed for DGX Spark."
fi

# ─── Gate 2: NVIDIA GPU ───
echo "--- Gate 2: NVIDIA GPU ---"
if command -v nvidia-smi &>/dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    if [ -n "$GPU_NAME" ]; then
        GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1)
        pass "NVIDIA GPU detected: $GPU_NAME ($GPU_MEM)"
    else
        fail "nvidia-smi present but no GPU found"
    fi
else
    warn "nvidia-smi not found (GPU acceleration may be unavailable)"
fi

# ─── Gate 3: Docker + Compose ───
echo "--- Gate 3: Docker + Compose ---"
if command -v docker &>/dev/null; then
    pass "Docker installed: $(docker --version | head -c 50)"
else
    fail "Docker not found"
fi

if docker compose version &>/dev/null; then
    pass "Docker Compose available"
else
    fail "Docker Compose not found"
fi

# ─── Gate 4: All 5 containers running ───
echo "--- Gate 4: Container Status ---"
EXPECTED_SERVICES=("postgres" "falkordb" "llm" "backend" "frontend")
for svc in "${EXPECTED_SERVICES[@]}"; do
    RUNNING=$($COMPOSE_CMD ps --status running --format "{{.Name}}" 2>/dev/null | grep -i "$svc" || true)
    if [ -n "$RUNNING" ]; then
        pass "Container running: $svc ($RUNNING)"
    else
        fail "Container NOT running: $svc"
    fi
done

# ─── Gate 5: PostgreSQL reachable ───
echo "--- Gate 5: PostgreSQL ---"
if $COMPOSE_CMD exec -T postgres pg_isready -U shop_user -d shop >/dev/null 2>&1; then
    pass "PostgreSQL is reachable"
else
    fail "PostgreSQL is not reachable"
fi

# ─── Gate 6: FalkorDB reachable ───
echo "--- Gate 6: FalkorDB ---"
PONG=$($COMPOSE_CMD exec -T falkordb redis-cli PING 2>/dev/null || echo "")
if echo "$PONG" | grep -q "PONG"; then
    pass "FalkorDB is reachable (PING -> PONG)"
else
    fail "FalkorDB is not reachable"
fi

# ─── Gate 7: FalkorDB graph has nodes ───
echo "--- Gate 7: FalkorDB Graph Data ---"
NODE_COUNT=$($COMPOSE_CMD exec -T falkordb redis-cli GRAPH.QUERY shop "MATCH (n) RETURN count(n) as c" 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
if [ -n "$NODE_COUNT" ] && [ "$NODE_COUNT" -gt 0 ] 2>/dev/null; then
    pass "FalkorDB graph has $NODE_COUNT nodes"
else
    fail "FalkorDB graph is empty (0 nodes). Run ingestion."
fi

# ─── Gate 8: Postgres has tables ───
echo "--- Gate 8: PostgreSQL Data ---"
TABLE_COUNT=$($COMPOSE_CMD exec -T postgres psql -U shop_user -d shop -tAq \
    -c "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('shop','core','qw')" 2>/dev/null || echo "0")
TABLE_COUNT=$(echo "$TABLE_COUNT" | tr -d '[:space:]')
if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 0 ] 2>/dev/null; then
    pass "PostgreSQL has $TABLE_COUNT tables in shop/core/qw schemas"
else
    warn "PostgreSQL has no application tables. Migrations may need to be applied."
fi

# ─── Gate 9: LLM responds ───
echo "--- Gate 9: LLM (Ollama) ---"
LLM_RESPONSE=$(curl -sf http://localhost:11434/api/tags 2>/dev/null)
if [ $? -eq 0 ]; then
    pass "Ollama API responding on port 11434"
    # Check for a model
    if echo "$LLM_RESPONSE" | grep -qi "llama\|qwen\|mistral\|mixtral\|phi\|gemma"; then
        MODEL_NAME=$(echo "$LLM_RESPONSE" | grep -oE '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass "LLM model available: $MODEL_NAME"
    else
        warn "No LLM model pulled yet. Pull one: docker exec <llm-container> ollama pull llama3.1:70b"
    fi
else
    fail "Ollama API not responding on port 11434"
fi

# ─── Gate 10: Backend /ping ───
echo "--- Gate 10: Backend Health ---"
PING_RESPONSE=$(curl -sf http://localhost:8090/ping 2>/dev/null)
if [ $? -eq 0 ]; then
    STATUS=$(echo "$PING_RESPONSE" | grep -oE '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    pass "Backend /ping responded (status: ${STATUS:-ok})"
else
    fail "Backend /ping not responding on port 8090"
fi

# ─── Gate 11: QueryWeaver responds ───
echo "--- Gate 11: QueryWeaver ---"
QW_RESPONSE=$(curl -sf -X POST http://localhost:8090/queryweaver/query \
    -H "Content-Type: application/json" \
    -d '{"question":"How many jobs are there?"}' 2>/dev/null)
if [ $? -eq 0 ] && echo "$QW_RESPONSE" | grep -q "ok"; then
    pass "QueryWeaver /queryweaver/query responded successfully"
else
    warn "QueryWeaver did not respond or returned error. Check backend logs."
fi

# ─── Gate 12: Frontend HTTP 200 ───
echo "--- Gate 12: Frontend ---"
FE_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null || echo "000")
if [ "$FE_STATUS" = "200" ]; then
    pass "Frontend returning HTTP 200 on port 3001"
else
    fail "Frontend not responding (HTTP $FE_STATUS)"
fi

# ─── Gate 13: End-to-end NL query ───
echo "--- Gate 13: End-to-End Query ---"
E2E_RESPONSE=$(curl -sf -X POST http://localhost:8090/query \
    -H "Content-Type: application/json" \
    -d '{"question":"How many jobs are there in the system?"}' \
    --max-time 120 2>/dev/null)
if [ $? -eq 0 ] && echo "$E2E_RESPONSE" | grep -q "answer"; then
    TIMING=$(echo "$E2E_RESPONSE" | grep -oE '"timing":[0-9]+' | head -1 | cut -d: -f2)
    pass "End-to-end NL query succeeded (${TIMING:-?}ms)"
else
    warn "End-to-end NL query failed or timed out. LLM may not be warmed up."
fi

# ─── Summary ───
echo ""
echo "============================================================"
echo " Verification Summary"
echo "============================================================"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  WARN: $WARN"
echo ""

TOTAL=$((PASS + FAIL + WARN))
echo "  Gates checked: $TOTAL / 13+"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "RESULT: DEPLOYMENT HAS FAILURES -- fix the items above before production use."
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo "RESULT: DEPLOYMENT OK WITH WARNINGS -- review warnings above."
    exit 0
else
    echo "RESULT: ALL GATES PASSED -- ShopIntel is production-ready on DGX Spark."
    exit 0
fi
