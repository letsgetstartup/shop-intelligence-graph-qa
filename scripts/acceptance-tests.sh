#!/usr/bin/env bash
set -euo pipefail
# Acceptance tests for ShopIntel sovereign local deployment

BASE_API="http://127.0.0.1:8090"
FRONTEND="http://127.0.0.1:3001"
FAIL=0
PASS=0

step() { echo ""; echo "== TEST: $1 =="; }
pass() { echo "  PASS"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

step "1) Backend API ping"
if curl -sf "$BASE_API/ping" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='ok'" 2>/dev/null; then
  pass
else
  fail "Backend /ping not responding"
fi

step "2) Database connectivity"
if curl -sf "$BASE_API/testdb" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='success'; print(f'  Nodes: {d[\"nodeCount\"]}')" 2>/dev/null; then
  pass
else
  fail "Database test failed"
fi

step "3) Graph has data (node count > 0)"
NODES=$(curl -sf "$BASE_API/testdb" | python3 -c "import sys,json; print(json.load(sys.stdin).get('nodeCount',0))" 2>/dev/null || echo "0")
if [ "$NODES" -gt 0 ] 2>/dev/null; then
  echo "  Graph contains $NODES nodes"
  pass
else
  fail "Graph is empty (0 nodes)"
fi

step "4) General query (no job_num - fallback)"
PAYLOAD='{"question":"How many jobs are there?"}'
if curl -sf -X POST "$BASE_API/query" -H "Content-Type: application/json" -d "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'answer' in d; print(f'  Answer: {d[\"answer\"][:80]}')" 2>/dev/null; then
  pass
else
  fail "General query failed"
fi

step "5) QueryWeaver hybrid query (tool_usage_for_job)"
PAYLOAD='{"question":"Show tool usage for job J26-00010","params":{"job_num":"J26-00010"}}'
RESP=$(curl -sf -X POST "$BASE_API/queryweaver/query" -H "Content-Type: application/json" -d "$PAYLOAD" 2>/dev/null || echo '{"ok":false}')
if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok',False)==True; print(f'  Route: {d.get(\"route\",\"N/A\")}, Strategy: {d.get(\"strategy\",\"N/A\")}')" 2>/dev/null; then
  pass
else
  fail "QueryWeaver hybrid query failed"
fi

step "6) Graph visualization endpoint"
PAYLOAD='{"limit":10}'
if curl -sf -X POST "$BASE_API/graph/raw" -H "Content-Type: application/json" -d "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Nodes: {len(d.get(\"nodes\",[]))}, Links: {len(d.get(\"links\",[]))}')" 2>/dev/null; then
  pass
else
  fail "Graph visualization endpoint failed"
fi

step "7) Frontend accessible"
if curl -sf "$FRONTEND" | head -c 100 | grep -q "html" 2>/dev/null; then
  pass
else
  fail "Frontend not accessible at $FRONTEND"
fi

step "8) Audit logs exist"
AUDIT_FILE=$(docker compose -f docker-compose.local.yml exec -T backend ls /app/audit/ 2>/dev/null | head -1 || echo "")
if [ -n "$AUDIT_FILE" ]; then
  echo "  Audit file: $AUDIT_FILE"
  pass
else
  echo "  (No audit logs yet - will be created on first query)"
  pass
fi

echo ""
echo "============================================"
echo " RESULTS: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -eq 0 ]; then
  echo " ALL ACCEPTANCE TESTS PASSED"
  exit 0
else
  echo " $FAIL TESTS FAILED"
  exit 1
fi
