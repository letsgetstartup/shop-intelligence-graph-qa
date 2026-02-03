#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Shop Intelligence Production Deployment to Google Cloud
# Auto-generated deployment script
###############################################################################

# Configuration
export GCP_PROJECT="nanoeng-fe538"
export GCP_ZONE="us-central1-a"
export VM_NAME="shop-intel-prod"
export VM_MACHINE_TYPE="e2-standard-4"
export VM_DISK_GB="100"
export VM_TAGS="shop-intel"
export API_PORT="3001"
export GRAPH_UI_PORT="3000"

# Paths
export LOCAL_ROOT="/Users/avirammizrahi/Desktop/falkorDB"
export LOCAL_BUNDLE_DIR="$LOCAL_ROOT/shop_intelligence_antigravity_prod_package (1)"
export REMOTE_ROOT="/opt/shop-intelligence"
export REMOTE_DEPLOY_DIR="$REMOTE_ROOT/antigravity_deploy"

# Add gcloud to PATH
export PATH="$HOME/google-cloud-sdk/bin:$PATH"

echo "🚀 Starting Shop Intelligence deployment to GCP"
echo "   Project: $GCP_PROJECT"
echo "   Zone: $GCP_ZONE"
echo "   VM: $VM_NAME"

###############################################################################
# 1) CREATE FIREWALL RULES
###############################################################################
echo ""
echo "== Creating firewall rules =="

# SSH
gcloud compute firewall-rules describe allow-ssh-shop-intel --project="$GCP_PROJECT" >/dev/null 2>&1 || \
gcloud compute firewall-rules create allow-ssh-shop-intel \
  --project="$GCP_PROJECT" \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=0.0.0.0/0 \
  --target-tags="$VM_TAGS"

# API (public)
gcloud compute firewall-rules describe allow-api-shop-intel --project="$GCP_PROJECT" >/dev/null 2>&1 || \
gcloud compute firewall-rules create allow-api-shop-intel \
  --project="$GCP_PROJECT" \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:${API_PORT} \
  --source-ranges=0.0.0.0/0 \
  --target-tags="$VM_TAGS"

# Graph UI (public - recommend restricting later)
gcloud compute firewall-rules describe allow-graphui-shop-intel --project="$GCP_PROJECT" >/dev/null 2>&1 || \
gcloud compute firewall-rules create allow-graphui-shop-intel \
  --project="$GCP_PROJECT" \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:${GRAPH_UI_PORT} \
  --source-ranges=0.0.0.0/0 \
  --target-tags="$VM_TAGS"

echo "✅ Firewall rules configured"

###############################################################################
# 2) CREATE VM
###############################################################################
echo ""
echo "== Creating VM =="

if ! gcloud compute instances describe "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" >/dev/null 2>&1; then
  gcloud compute instances create "$VM_NAME" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE" \
    --machine-type="$VM_MACHINE_TYPE" \
    --tags="$VM_TAGS" \
    --boot-disk-size="${VM_DISK_GB}GB" \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud
  
  echo "⏳ Waiting 30s for VM to fully boot..."
  sleep 30
else
  echo "✅ VM already exists: $VM_NAME"
fi

export VM_IP
VM_IP="$(gcloud compute instances describe "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
echo "✅ VM IP: $VM_IP"

###############################################################################
# 3) INSTALL RUNTIME ON VM
###############################################################################
echo ""
echo "== Installing Docker + runtime on VM =="

gcloud compute ssh "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" --command "sudo bash -c '
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# Update packages
apt-get update -y

# Install prerequisites
apt-get install -y ca-certificates curl gnupg lsb-release git unzip python3 python3-venv python3-pip

# Docker installation
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \$VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add ubuntu user to docker group
usermod -aG docker ubuntu || true

# Enable and start Docker
systemctl enable docker
systemctl start docker

echo \"✅ Docker installed\"
docker version
docker compose version
'"

echo "✅ Runtime installed"

###############################################################################
# 4) UPLOAD DEPLOYMENT PACKAGE
###############################################################################
echo ""
echo "== Uploading deployment package =="

# Create remote directory
gcloud compute ssh "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" --command "sudo mkdir -p $REMOTE_ROOT && sudo chown ubuntu:ubuntu $REMOTE_ROOT"

# Create temporary tarball for faster upload
echo "Creating tarball..."
cd "$LOCAL_ROOT"
tar -czf /tmp/shop_intel_deploy.tar.gz -C "$LOCAL_BUNDLE_DIR" .

# Upload tarball
echo "Uploading to VM..."
gcloud compute scp --zone="$GCP_ZONE" --project="$GCP_PROJECT" /tmp/shop_intel_deploy.tar.gz "$VM_NAME:$REMOTE_ROOT/"

# Extract on VM
gcloud compute ssh "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" --command "
cd $REMOTE_ROOT
rm -rf antigravity_deploy
mkdir -p antigravity_deploy
tar -xzf shop_intel_deploy.tar.gz -C antigravity_deploy
rm shop_intel_deploy.tar.gz
chmod +x antigravity_deploy/bin/*.sh
ls -la antigravity_deploy/
"

# Clean up local tarball
rm /tmp/shop_intel_deploy.tar.gz

echo "✅ Deployment package uploaded"

###############################################################################
# 5) RUN BOOTSTRAP
###############################################################################
echo ""
echo "== Running bootstrap script =="

gcloud compute ssh "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" --command "
cd $REMOTE_DEPLOY_DIR
./bin/bootstrap.sh
"

echo "✅ Bootstrap completed"

###############################################################################
# 6) RUN VALIDATION
###############################################################################
echo ""
echo "== Running validation =="

gcloud compute ssh "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" --command "
cd $REMOTE_DEPLOY_DIR
./bin/validate.sh || true
"

###############################################################################
# 7) FINAL STATUS
###############################################################################
echo ""
echo "========================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "📡 API URL:       http://$VM_IP:$API_PORT"
echo "🕸️  Graph UI:     http://$VM_IP:$GRAPH_UI_PORT"
echo "🔍 QueryWeaver:   POST http://$VM_IP:$API_PORT/queryweaver/query"
echo ""
echo "== Quick smoke test =="
echo "curl -X POST http://$VM_IP:$API_PORT/queryweaver/query \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"question\":\"What tools are missing for the next shift?\"}'"
echo ""
echo "== Services =="
gcloud compute ssh "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT" --command "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
echo ""
echo "========================================="
