#!/bin/bash
set -e

# =============================================================================
# Route B Complete Production Setup Script
# =============================================================================
# This script implements the full "Route B" architecture:
# - Creates VPC connector for private database access
# - Configures firewall rules
# - Updates Cloud Run configuration
# - Sets environment variables/secrets
# 
# REQUIREMENTS:
# - gcloud CLI authenticated with project nanoeng-fe538
# - Appropriate IAM permissions (compute.admin, run.admin, secretmanager.admin)
# 
# USAGE:
#   bash deploy_route_b_complete.sh
# =============================================================================

PROJECT_ID="nanoeng-fe538"
REGION="us-central1"
ZONE="us-central1-a"
NETWORK="default"
CONNECTOR_NAME="shop-intel-connector"
CONNECTOR_CIDR="10.8.0.0/28"
VM_NAME="shop-intel-prod"
VM_PRIVATE_IP="10.128.0.2"
CLOUD_RUN_SERVICE="api"

echo "🚀 Starting Route B Production Setup for $PROJECT_ID"
echo "=================================================="
echo ""

# =============================================================================
# PHASE 1: VPC CONNECTOR
# =============================================================================
echo "📡 PHASE 1: Creating VPC Connector..."
echo ""

# Enable API
echo "Enabling Serverless VPC Access API..."
gcloud services enable vpcaccess.googleapis.com --project=$PROJECT_ID

# Create connector
echo "Creating VPC connector: $CONNECTOR_NAME"
if gcloud compute networks vpc-access connectors describe $CONNECTOR_NAME \
  --region=$REGION --project=$PROJECT_ID &>/dev/null; then
  echo "✅ Connector already exists"
else
  gcloud compute networks vpc-access connectors create $CONNECTOR_NAME \
    --network=$NETWORK \
    --region=$REGION \
    --range=$CONNECTOR_CIDR \
    --project=$PROJECT_ID
  echo "✅ Connector created"
fi

# Verify
echo "Verifying connector status..."
gcloud compute networks vpc-access connectors describe $CONNECTOR_NAME \
  --region=$REGION --project=$PROJECT_ID --format="value(state)"

echo ""

# =============================================================================
# PHASE 2: FIREWALL RULES
# =============================================================================
echo "🔥 PHASE 2: Configuring Firewall Rules..."
echo ""

# Add network tag to VM
echo "Adding network tag 'shop-intel' to VM..."
gcloud compute instances add-tags $VM_NAME \
  --zone=$ZONE \
  --tags=shop-intel \
  --project=$PROJECT_ID

# PostgreSQL firewall rule
echo "Creating firewall rule for PostgreSQL (port 5432)..."
if gcloud compute firewall-rules describe allow-postgres-from-connector \
  --project=$PROJECT_ID &>/dev/null; then
  echo "✅ Postgres firewall rule already exists"
else
  gcloud compute firewall-rules create allow-postgres-from-connector \
    --project=$PROJECT_ID \
    --network=$NETWORK \
    --direction=INGRESS \
    --priority=1000 \
    --action=ALLOW \
    --rules=tcp:5432 \
    --source-ranges=$CONNECTOR_CIDR \
    --target-tags=shop-intel \
    --description="Allow VPC connector to access PostgreSQL"
  echo "✅ Postgres firewall rule created"
fi

# FalkorDB/Redis firewall rule
echo "Creating firewall rule for FalkorDB/Redis (port 6379)..."
if gcloud compute firewall-rules describe allow-redis-from-connector \
  --project=$PROJECT_ID &>/dev/null; then
  echo "✅ Redis firewall rule already exists"
else
  gcloud compute firewall-rules create allow-redis-from-connector \
    --project=$PROJECT_ID \
    --network=$NETWORK \
    --direction=INGRESS \
    --priority=1000 \
    --action=ALLOW \
    --rules=tcp:6379 \
    --source-ranges=$CONNECTOR_CIDR \
    --target-tags=shop-intel \
    --description="Allow VPC connector to access FalkorDB/Redis"
  echo "✅ Redis firewall rule created"
fi

echo ""

# =============================================================================
# PHASE 3: CLOUD RUN CONFIGURATION
# =============================================================================
echo "☁️  PHASE 3: Updating Cloud Run Service..."
echo ""

# Attach VPC connector and set egress
echo "Configuring Cloud Run service '$CLOUD_RUN_SERVICE'..."
gcloud run services update $CLOUD_RUN_SERVICE \
  --project=$PROJECT_ID \
  --region=$REGION \
  --vpc-connector=$CONNECTOR_NAME \
  --vpc-egress=private-ranges-only

echo "✅ Cloud Run updated with VPC connector"
echo ""

# =============================================================================
# PHASE 4: ENVIRONMENT VARIABLES & SECRETS
# =============================================================================
echo "🔐 PHASE 4: Setting Environment Variables..."
echo ""

# Update secrets to use private IPs
echo "Updating POSTGRES_URL secret..."
echo "postgresql://shop_user:shop_pass@${VM_PRIVATE_IP}:5432/shop?sslmode=prefer" | \
  gcloud secrets versions add POSTGRES_URL --project=$PROJECT_ID --data-file=-

echo "Updating FALKORDB_URL secret..."
echo "redis://${VM_PRIVATE_IP}:6379" | \
  gcloud secrets versions add FALKORDB_URL --project=$PROJECT_ID --data-file=-

# Set other environment variables
echo "Setting other environment variables..."
gcloud run services update $CLOUD_RUN_SERVICE \
  --project=$PROJECT_ID \
  --region=$REGION \
  --set-env-vars=GRAPH_NAME=shop \
  --set-env-vars=QUERYWEAVER_CONFIG_PATH=./config/queryweaver.config.json \
  --set-env-vars=GCP_PROJECT=$PROJECT_ID \
  --set-env-vars=GCP_REGION=$REGION \
  --set-env-vars=GEMINI_MODEL=gemini-2.0-flash-exp

echo "✅ Environment variables configured"
echo ""

# =============================================================================
# PHASE 5: VERIFY SERVICE ACCOUNT PERMISSIONS
# =============================================================================
echo "👤 PHASE 5: Verifying Service Account Permissions..."
echo ""

SERVICE_ACCOUNT=$(gcloud run services describe $CLOUD_RUN_SERVICE \
  --project=$PROJECT_ID --region=$REGION --format="value(spec.template.spec.serviceAccountName)")

echo "Service Account: $SERVICE_ACCOUNT"

# Grant necessary roles (only if not already granted)
echo "Ensuring required IAM roles..."

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/aiplatform.user" \
  --condition=None \
  --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/vpcaccess.user" \
  --condition=None \
  --quiet

echo "✅ Service account permissions verified"
echo ""

# =============================================================================
# PHASE 6: SUMMARY
# =============================================================================
echo "=================================================="
echo "✅ Route B Setup Complete!"
echo "=================================================="
echo ""
echo "Infrastructure Summary:"
echo "  • VPC Connector: $CONNECTOR_NAME ($CONNECTOR_CIDR)"
echo "  • Firewall Rules: allow-postgres-from-connector, allow-redis-from-connector"
echo "  • Cloud Run Service: $CLOUD_RUN_SERVICE"
echo "  • Egress Setting: private-ranges-only"
echo "  • Database Endpoints: $VM_PRIVATE_IP:5432 (Postgres), $VM_PRIVATE_IP:6379 (Redis)"
echo ""
echo "Next Steps:"
echo "  1. Run schema alignment: curl -X POST https://nanoeng-fe538.web.app/admin/sync-schema -H 'Content-Type: application/json' -d '{\"password\":\"align-schema-2026\"}'"
echo "  2. Run acceptance tests (see test_production.sh)"
echo "  3. Verify UI at https://nanoeng-fe538.web.app/"
echo ""
