#!/bin/bash
#
# Production QueryWeaver Deployment Script (Best Practices)
# 
# This script configures the Cloud Run service 'api' with production credentials
# using GCP best practices (Secret Manager for sensitive data).
#
# Prerequisites:
# - gcloud CLI authenticated
# - Production Postgres and FalkorDB instances accessible
# - Required GCP APIs enabled (Cloud Run, Secret Manager)

set -e  # Exit on error

PROJECT_ID="nanoeng-fe538"
REGION="us-central1"
SERVICE_NAME="api"

echo "========================================="
echo "QueryWeaver Production Deployment"
echo "========================================="
echo ""

# Color codes for output
GREEN='\033[0.32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ============================================================================
# STEP 1: Set Production Credentials
# ============================================================================

echo -e "${YELLOW}STEP 1: Configure Production Credentials${NC}"
echo ""
echo "You need to provide the following:"
echo "  1. POSTGRES_URL - postgresql://USER:PASS@HOST:5432/DB?sslmode=require"
echo "  2. FALKORDB_URL - redis://USER:PASS@HOST:6379 (or falkors:// for TLS)"
echo ""

# Prompt for credentials (or read from environment if already set)
if [ -z "$POSTGRES_URL" ]; then
    echo -n "Enter POSTGRES_URL: "
    read -s POSTGRES_URL
    echo ""
fi

if [ -z "$FALKORDB_URL" ]; then
    echo -n "Enter FALKORDB_URL: "
    read -s FALKORDB_URL
    echo ""
fi

echo -e "${GREEN}✓ Credentials received${NC}"
echo ""

# ============================================================================
# STEP 2: Choose Deployment Method
# ============================================================================

echo -e "${YELLOW}STEP 2: Select Deployment Method${NC}"
echo ""
echo "Choose how to store credentials:"
echo "  1) Environment Variables (quickest, less secure)"
echo "  2) Secret Manager (recommended, more secure)"
echo ""
echo -n "Select [1/2, default=2]: "
read DEPLOY_METHOD
DEPLOY_METHOD=${DEPLOY_METHOD:-2}

if [ "$DEPLOY_METHOD" == "2" ]; then
    echo ""
    echo -e "${YELLOW}Creating secrets in Secret Manager...${NC}"
    
    # Create secrets
    echo -n "$POSTGRES_URL" | gcloud secrets create POSTGRES_URL \
        --project="$PROJECT_ID" \
        --data-file=- \
        --replication-policy="automatic" 2>/dev/null || \
    echo -n "$POSTGRES_URL" | gcloud secrets versions add POSTGRES_URL \
        --project="$PROJECT_ID" \
        --data-file=-
    
    echo -n "$FALKORDB_URL" | gcloud secrets create FALKORDB_URL \
        --project="$PROJECT_ID" \
        --data-file=- \
        --replication-policy="automatic" 2>/dev/null || \
    echo -n "$FALKORDB_URL" | gcloud secrets versions add FALKORDB_URL \
        --project="$PROJECT_ID" \
        --data-file=-
    
    # Grant Cloud Run service account access
    SERVICE_ACCOUNT=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(spec.template.spec.serviceAccountName)")
    
    if [ -z "$SERVICE_ACCOUNT" ]; then
        SERVICE_ACCOUNT="$PROJECT_ID@appspot.gserviceaccount.com"
    fi
    
    gcloud secrets add-iam-policy-binding POSTGRES_URL \
        --project="$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor" > /dev/null
    
    gcloud secrets add-iam-policy-binding FALKORDB_URL \
        --project="$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor" > /dev/null
    
    echo -e "${GREEN}✓ Secrets created and permissions granted${NC}"
    echo ""
    echo -e "${YELLOW}Note: You need to update functions/index.js to use secrets${NC}"
    echo "Add to the onRequest config:"
    echo "  secrets: ['POSTGRES_URL', 'FALKORDB_URL']"
    echo ""
    echo -n "Press Enter to continue with environment variables for now..."
    read
fi

# ============================================================================
# STEP 3: Update Cloud Run Service Environment Variables
# ============================================================================

echo -e "${YELLOW}STEP 3: Updating Cloud Run Service Environment${NC}"
echo ""

gcloud run services update "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --set-env-vars="POSTGRES_URL=$POSTGRES_URL" \
    --set-env-vars="FALKORDB_URL=$FALKORDB_URL" \
    --set-env-vars="GRAPH_NAME=shop" \
    --set-env-vars="QUERYWEAVER_CONFIG_PATH=./config/queryweaver.config.json" \
    --set-env-vars="GCP_PROJECT=$PROJECT_ID" \
    --set-env-vars="GCP_REGION=$REGION" \
    --set-env-vars="GEMINI_MODEL=gemini-2.0-flash-exp"

echo -e "${GREEN}✓ Cloud Run service updated${NC}"
echo ""

# ============================================================================
# STEP 4: Verify Database Schema (core.* vs qw.*)
# ============================================================================

echo -e "${YELLOW}STEP 4: Schema Verification${NC}"
echo ""
echo "Checking if core.* views exist in production..."
echo ""

# Extract connection components for psql
DB_HOST=$(echo "$POSTGRES_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$POSTGRES_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$POSTGRES_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Run schema verification query
SCHEMA_CHECK=$(PGPASSWORD=$(echo "$POSTGRES_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p') \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$(echo "$POSTGRES_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')" \
    -d "$DB_NAME" \
    -t -c "SELECT COUNT(*) FROM pg_views WHERE schemaname = 'core' AND viewname IN ('operations','required_tools','machine_magazine','tool_inventory','shift_plan','nc_program_tools');" \
    2>/dev/null)

if [ "$SCHEMA_CHECK" -eq "6" ]; then
    echo -e "${GREEN}✓ All 6 core.* views exist - no action needed${NC}"
else
    echo -e "${RED}⚠ Found $SCHEMA_CHECK/6 core.* views${NC}"
    echo ""
    echo "Creating core.* views aliasing qw.*..."
    echo ""
    
    # Create schema aliases
    PGPASSWORD=$(echo "$POSTGRES_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p') \
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$(echo "$POSTGRES_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')" \
        -d "$DB_NAME" << 'EOF'
CREATE SCHEMA IF NOT EXISTS core;

CREATE OR REPLACE VIEW core.operations        AS SELECT * FROM qw.operations;
CREATE OR REPLACE VIEW core.required_tools    AS SELECT * FROM qw.required_tools;
CREATE OR REPLACE VIEW core.machine_magazine  AS SELECT * FROM qw.machine_magazine;
CREATE OR REPLACE VIEW core.tool_inventory    AS SELECT * FROM qw.tool_inventory;
CREATE OR REPLACE VIEW core.shift_plan        AS SELECT * FROM qw.shift_plan;
CREATE OR REPLACE VIEW core.nc_program_tools  AS SELECT * FROM qw.nc_program_tools;
EOF
    
    echo -e "${GREEN}✓ Schema aliases created${NC}"
fi

echo ""

# ============================================================================
# STEP 5: Run Acceptance Tests
# ============================================================================

echo -e "${YELLOW}STEP 5: Running Acceptance Tests${NC}"
echo ""

BASE_URL="https://nanoeng-fe538.web.app"

# Test 1: Health Check
echo -n "Test 1 - Health Check (/ping): "
RESPONSE=$(curl -s "$BASE_URL/ping")
if echo "$RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "Response: $RESPONSE"
fi

# Test 2: FalkorDB Connectivity
echo -n "Test 2 - FalkorDB (/testdb): "
RESPONSE=$(curl -s "$BASE_URL/testdb")
if echo "$RESPONSE" | grep -q '"status":"success"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "Response: $RESPONSE"
fi

# Test 3: Raw QueryWeaver (SQL-only)
echo -n "Test 3 - QueryWeaver SQL-only: "
RESPONSE=$(curl -s -X POST "$BASE_URL/queryweaver/query" \
    -H "Content-Type: application/json" \
    -d '{"question":"machines loaded magazine","params":{}}')
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "Response: $RESPONSE"
fi

# Test 4: Raw QueryWeaver (Hybrid)
echo -n "Test 4 - QueryWeaver Hybrid: "
RESPONSE=$(curl -s -X POST "$BASE_URL/queryweaver/query" \
    -H "Content-Type: application/json" \
    -d '{"question":"tool usage job","params":{"job_num":"J26-00010"}}')
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "Response: $RESPONSE"
fi

# Test 5: Chat Wrapper
echo -n "Test 5 - Chat Wrapper (/query): "
RESPONSE=$(curl -s -X POST "$BASE_URL/query" \
    -H "Content-Type: application/json" \
    -d '{"question":"What tools are missing?","params":{}}')
if echo "$RESPONSE" | grep -q '"answer"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "Response: $RESPONSE"
fi

echo ""
echo "========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "========================================="
echo ""
echo "Next Steps:"
echo "  1. Test the UI at: https://nanoeng-fe538.web.app/"
echo "  2. Monitor logs: firebase functions:log"
echo "  3. Check metrics in Cloud Console"
echo ""
echo "If you used Secret Manager (#2), remember to:"
echo "  - Update functions/index.js to declare secrets"
echo "  - Redeploy functions: firebase deploy --only functions"
