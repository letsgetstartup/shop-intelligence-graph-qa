#!/usr/bin/env bash
# =============================================================================
# Offline Deployment Script for NVIDIA DGX Spark
# Run this AFTER transferring the bundle from the build machine.
#
# Prerequisites:
#   - NVIDIA DGX Spark with DGX OS (Ubuntu-based, ARM64)
#   - Docker + Docker Compose installed
#   - NVIDIA Container Toolkit installed
#   - Bundle transferred to this machine (e.g. /opt/shopintel/)
#
# Usage:
#   cd /opt/shopintel
#   bash scripts/deploy-offline.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BUNDLE_ROOT"

PASS=0
FAIL=0
WARN=0

pass() { echo "  [OK]   $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN + 1)); }

echo "============================================================"
echo " ShopIntel Offline Deployment on DGX Spark"
echo "============================================================"
echo "  Bundle: $BUNDLE_ROOT"
echo "  Arch:   $(uname -m)"
echo "  Date:   $(date -Iseconds)"
echo ""

# ─────────────────────────────────────────────────────────────────
# Step 1: Pre-flight checks
# ─────────────────────────────────────────────────────────────────
echo "--- Step 1: Pre-flight Checks ---"

# Architecture
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
    pass "ARM64 architecture detected"
else
    warn "Expected aarch64, detected $ARCH"
fi

# Docker
if command -v docker &>/dev/null; then
    pass "Docker installed: $(docker --version | head -c 50)"
else
    fail "Docker not found. Install Docker first."
    exit 1
fi

if docker compose version &>/dev/null; then
    pass "Docker Compose available"
else
    fail "Docker Compose not found."
    exit 1
fi

# NVIDIA GPU
if command -v nvidia-smi &>/dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    if [ -n "$GPU_NAME" ]; then
        pass "NVIDIA GPU detected: $GPU_NAME"
    else
        warn "nvidia-smi found but no GPU detected"
    fi
else
    warn "nvidia-smi not found (GPU acceleration may not work)"
fi

# ─────────────────────────────────────────────────────────────────
# Step 2: Verify bundle integrity
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 2: Bundle Integrity ---"

if [ -f "manifest/sha256sum.txt" ]; then
    echo "  Verifying checksums..."
    CHECKSUM_ERRORS=0
    while IFS= read -r line; do
        HASH=$(echo "$line" | awk '{print $1}')
        FILE=$(echo "$line" | awk '{print $2}')
        if [ -f "$FILE" ]; then
            ACTUAL=$(sha256sum "$FILE" | awk '{print $1}')
            if [ "$HASH" != "$ACTUAL" ]; then
                fail "Checksum mismatch: $FILE"
                CHECKSUM_ERRORS=$((CHECKSUM_ERRORS + 1))
            fi
        fi
    done < manifest/sha256sum.txt
    if [ "$CHECKSUM_ERRORS" -eq 0 ]; then
        pass "All file checksums verified"
    fi
else
    warn "No manifest found, skipping integrity check"
fi

# ─────────────────────────────────────────────────────────────────
# Step 3: Load Docker images from tarballs
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 3: Loading Docker Images ---"

if [ -d "images" ]; then
    for tarball in images/*.tar; do
        if [ -f "$tarball" ]; then
            echo "  Loading $(basename "$tarball")..."
            docker load -i "$tarball" 2>&1 | tail -1
        fi
    done
    pass "All Docker images loaded"
else
    fail "images/ directory not found in bundle"
fi

# ─────────────────────────────────────────────────────────────────
# Step 4: Restore LLM model volume
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 4: Restoring LLM Model ---"

if [ -f "models/ollama-models.tar.gz" ]; then
    # Create the volume if it doesn't exist
    docker volume create shopintel-dgx-spark_ollama_data 2>/dev/null || true

    echo "  Extracting model data to volume..."
    docker run --rm \
        -v shopintel-dgx-spark_ollama_data:/target \
        -v "$(pwd)/models:/backup:ro" \
        alpine sh -c "cd /target && tar xzf /backup/ollama-models.tar.gz"
    pass "LLM model restored to Docker volume"
else
    warn "No model archive found. You will need to pull the model manually after starting Ollama."
fi

# ─────────────────────────────────────────────────────────────────
# Step 5: Set up compose files and environment
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 5: Setting Up Configuration ---"

# Copy compose files to working directory if they're in config/
if [ -f "config/docker-compose.local.yml" ]; then
    cp config/docker-compose.local.yml ./docker-compose.local.yml
fi
if [ -f "config/docker-compose.dgx-spark.yml" ]; then
    cp config/docker-compose.dgx-spark.yml ./docker-compose.dgx-spark.yml
fi
if [ -f "config/.env" ]; then
    cp config/.env ./.env
fi

pass "Configuration files in place"

# ─────────────────────────────────────────────────────────────────
# Step 6: Start the compose stack
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 6: Starting Services ---"

echo "  Starting infrastructure (postgres, falkordb, llm)..."
docker compose \
    -f docker-compose.local.yml \
    -f docker-compose.dgx-spark.yml \
    up -d postgres falkordb llm

echo "  Waiting for infrastructure to be healthy..."
sleep 10

# Wait for Postgres
for i in $(seq 1 30); do
    if docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml \
        exec -T postgres pg_isready -U shop_user -d shop >/dev/null 2>&1; then
        pass "PostgreSQL is healthy"
        break
    fi
    if [ "$i" -eq 30 ]; then fail "PostgreSQL did not become healthy"; fi
    sleep 2
done

# Wait for FalkorDB
for i in $(seq 1 30); do
    if docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml \
        exec -T falkordb redis-cli PING 2>/dev/null | grep -q PONG; then
        pass "FalkorDB is healthy"
        break
    fi
    if [ "$i" -eq 30 ]; then fail "FalkorDB did not become healthy"; fi
    sleep 2
done

# ─────────────────────────────────────────────────────────────────
# Step 7: Apply SQL migrations
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 7: Applying SQL Migrations ---"

if [ -f "scripts/apply-migrations.sh" ] && [ -d "db/migrations" ]; then
    # Run migrations via the postgres container
    docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml \
        exec -T postgres sh -c "
            for sql in /docker-entrypoint-initdb.d/*.sql; do
                echo \"  Applying \$(basename \$sql)...\"
                psql -U shop_user -d shop -f \"\$sql\" 2>&1 | tail -1 || true
            done
        "
    pass "SQL migrations applied"
else
    warn "Migration files not found, skipping"
fi

# ─────────────────────────────────────────────────────────────────
# Step 8: Start application services
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 8: Starting Application ---"

docker compose \
    -f docker-compose.local.yml \
    -f docker-compose.dgx-spark.yml \
    up -d

echo "  Waiting for application to start..."
sleep 15

# Check backend
for i in $(seq 1 20); do
    if curl -sf http://localhost:8090/ping >/dev/null 2>&1; then
        pass "Backend is responding on port 8090"
        break
    fi
    if [ "$i" -eq 20 ]; then warn "Backend not yet responding (may still be warming up)"; fi
    sleep 5
done

# Check frontend
for i in $(seq 1 10); do
    if curl -sf http://localhost:3001/ >/dev/null 2>&1; then
        pass "Frontend is responding on port 3001"
        break
    fi
    if [ "$i" -eq 10 ]; then warn "Frontend not yet responding"; fi
    sleep 3
done

# ─────────────────────────────────────────────────────────────────
# Step 9: Install systemd service (optional)
# ─────────────────────────────────────────────────────────────────
echo ""
echo "--- Step 9: Systemd Auto-Start ---"

if [ -f "systemd/shopintel.service" ]; then
    if command -v systemctl &>/dev/null; then
        sudo cp systemd/shopintel.service /etc/systemd/system/
        sudo systemctl daemon-reload
        sudo systemctl enable shopintel.service
        pass "Systemd service installed and enabled"
    else
        warn "systemctl not found, skipping systemd setup"
    fi
else
    warn "No systemd service file found, skipping"
fi

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " Deployment Summary"
echo "============================================================"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  WARN: $WARN"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo "RESULT: DEPLOYMENT HAS FAILURES. Fix the items above."
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo "RESULT: DEPLOYMENT OK WITH WARNINGS."
else
    echo "RESULT: DEPLOYMENT SUCCESSFUL."
fi

echo ""
echo " Services:"
echo "   Frontend:  http://localhost:3001"
echo "   Backend:   http://localhost:8090"
echo "   FalkorDB:  redis://localhost:6380"
echo "   Postgres:  postgresql://localhost:5433"
echo "   Ollama:    http://localhost:11434"
echo ""
echo " Next steps:"
echo "   1. Run verification: bash scripts/verify-dgx-spark-shopintel.sh"
echo "   2. Pull LLM model (if not pre-bundled):"
echo "      docker compose -f docker-compose.local.yml -f docker-compose.dgx-spark.yml exec llm ollama pull llama3.1:70b"
echo "   3. Open browser: http://localhost:3001"
echo "============================================================"
