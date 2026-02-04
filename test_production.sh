#!/bin/bash

# =============================================================================
# Production Acceptance Test Suite
# =============================================================================
# Runs all 5 required acceptance tests for Route B + QueryWeaver Option 1
# 
# USAGE:
#   bash test_production.sh
# =============================================================================

BASE_URL="https://nanoeng-fe538.web.app"
FAILED=0

echo "🧪 Running Production Acceptance Tests"
echo "======================================="
echo "Base URL: $BASE_URL"
echo ""

# =============================================================================
# Test 1: Health Check
# =============================================================================
echo "Test 1: Health Check (/ping)"
echo "----------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/ping")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ PASS - Status: $HTTP_CODE"
  echo "Response: $BODY"
else
  echo "❌ FAIL - Status: $HTTP_CODE"
  echo "Response: $BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# =============================================================================
# Test 2: FalkorDB Connectivity
# =============================================================================
echo "Test 2: FalkorDB Connectivity (/testdb)"
echo "----------------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/testdb")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "success"; then
  echo "✅ PASS - Status: $HTTP_CODE"
  echo "Response: $BODY"
else
  echo "❌ FAIL - Status: $HTTP_CODE"
  echo "Response: $BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# =============================================================================
# Test 3: QueryWeaver SQL-Only
# =============================================================================
echo "Test 3: QueryWeaver SQL-Only Route"
echo "-----------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/queryweaver/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"machines loaded magazine","params":{}}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"ok":true' && echo "$BODY" | grep -q '"strategy":"sql_only"'; then
  echo "✅ PASS - Status: $HTTP_CODE"
  echo "Response: $BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ FAIL - Status: $HTTP_CODE"
  echo "Response: $BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# =============================================================================
# Test 4: QueryWeaver Hybrid (SQL + Cypher)
# =============================================================================
echo "Test 4: QueryWeaver Hybrid Route (SQL + Cypher)"
echo "------------------------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/queryweaver/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"tool usage job","params":{"job_num":"J26-00010"}}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"ok":true' && echo "$BODY" | grep -q '"strategy":"hybrid"'; then
  echo "✅ PASS - Status: $HTTP_CODE"
  
  # Check for both SQL and graph data
  if echo "$BODY" | grep -q '"sql"' && echo "$BODY" | grep -q '"graph"'; then
    echo "✅ Contains both SQL and graph data"
  else
    echo "⚠️  WARNING: Missing SQL or graph data"
  fi
  
  echo "Response: $BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ FAIL - Status: $HTTP_CODE"
  echo "Response: $BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# =============================================================================
# Test 5: Chat Wrapper Endpoint (Option 1)
# =============================================================================
echo "Test 5: Chat Wrapper Endpoint (/query)"
echo "---------------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"What tools are missing for the next shift?","params":{"shift_name":"Morning"}}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q '"answer"' && echo "$BODY" | grep -q '"suggestions"'; then
  echo "✅ PASS - Status: $HTTP_CODE"
  echo "Response: $BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "❌ FAIL - Status: $HTTP_CODE"
  echo "Response: $BODY" | jq '.' 2>/dev/null || echo "$BODY"
  FAILED=$((FAILED + 1))
fi
echo ""

# =============================================================================
# Summary
# =============================================================================
echo "======================================="
if [ $FAILED -eq 0 ]; then
  echo "✅ ALL TESTS PASSED (5/5)"
  echo "======================================="
  echo ""
  echo "System Status: PRODUCTION READY ✅"
  echo ""
  echo "Next Steps:"
  echo "  • Test UI at $BASE_URL"
  echo "  • Monitor Cloud Run logs: firebase functions:log --only api"
  echo "  • Set up monitoring/alerting"
  exit 0
else
  echo "❌ $FAILED TEST(S) FAILED"
  echo "======================================="
  echo ""
  echo "System Status: NOT READY ❌"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check Cloud Run logs: firebase functions:log --only api --lines 50"
  echo "  2. Verify VPC connector: gcloud compute networks vpc-access connectors describe shop-intel-connector --region us-central1"
  echo "  3. Check firewall rules: gcloud compute firewall-rules list --filter='name~connector'"
  echo "  4. Verify database connectivity from VM"
  exit 1
fi
