#!/bin/bash
set -e

# Configuration
PROJECT_ID="nanoeng-fe538"
REGION="us-central1"
NETWORK="default"
CONNECTOR_NAME="shop-intel-connector"
ROUTER_NAME="shop-intel-router"
NAT_NAME="shop-intel-nat"
STATIC_IP_NAME="shop-intel-static-ip"
IP_RANGE="10.8.0.0/28"

echo "🚀 Starting Network Configuration for $PROJECT_ID in $REGION..."

# 1. Enable Services
echo "Enable Serverless VPC Access API..."
gcloud services enable vpcaccess.googleapis.com --project=$PROJECT_ID

# 2. Reserver Static IP
echo "Checking/Creating Static IP ($STATIC_IP_NAME)..."
if ! gcloud compute addresses describe $STATIC_IP_NAME --region=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    gcloud compute addresses create $STATIC_IP_NAME --region=$REGION --project=$PROJECT_ID
    echo "✅ IP Created."
else
    echo "✅ IP already exists."
fi

STATIC_IP=$(gcloud compute addresses describe $STATIC_IP_NAME --region=$REGION --project=$PROJECT_ID --format="value(address)")
echo "ℹ️  Static IP: $STATIC_IP"

# 3. Create VPC Connector
echo "Checking/Creating VPC Connector ($CONNECTOR_NAME)..."
if ! gcloud compute networks vpc-access connectors describe $CONNECTOR_NAME --region=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    gcloud compute networks vpc-access connectors create $CONNECTOR_NAME \
        --network=$NETWORK \
        --region=$REGION \
        --range=$IP_RANGE \
        --project=$PROJECT_ID
    echo "✅ Connector Created."
else
    echo "✅ Connector already exists."
fi

# 4. Create Cloud Router
echo "Checking/Creating Cloud Router ($ROUTER_NAME)..."
if ! gcloud compute routers describe $ROUTER_NAME --region=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    gcloud compute routers create $ROUTER_NAME \
        --network=$NETWORK \
        --region=$REGION \
        --project=$PROJECT_ID
    echo "✅ Router Created."
else
    echo "✅ Router already exists."
fi

# 5. Create Cloud NAT
echo "Checking/Creating Cloud NAT ($NAT_NAME)..."
if ! gcloud compute routers nats describe $NAT_NAME --router=$ROUTER_NAME --region=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    gcloud compute routers nats create $NAT_NAME \
        --router=$ROUTER_NAME \
        --region=$REGION \
        --nat-external-ip-pool=$STATIC_IP_NAME \
        --nat-all-subnet-ip-ranges \
        --enable-logging \
        --project=$PROJECT_ID
    echo "✅ Cloud NAT Created."
else
    echo "✅ Cloud NAT already exists."
fi

echo "========================================================"
echo "🎉 Network Setup Complete!"
echo "ℹ️  You must whitelist this IP in FalkorDB: $STATIC_IP"
echo "========================================================"
