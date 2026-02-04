# Route B Production Deployment Instructions

## Overview

This guide will make **https://nanoeng-fe538.web.app/** production-ready using **Route B** (VPC Connector + Private IP).

**Estimated Time**: 15-20 minutes

---

## Prerequisites

✅ **Local Machine** (already done):
- Code updated with `PRIVATE_RANGES_ONLY` egress setting
- Deployment scripts created
- Test scripts ready

⚠️ **Requires Cloud Shell or gcloud-enabled machine**:
- The infrastructure setup needs `gcloud` CLI
- You can run this from [Google Cloud Shell](https://shell.cloud.google.com/)

---

## Step-by-Step Deployment

### Step 1: Upload Scripts to Cloud Shell

From your local machine, upload the deployment script to Cloud Shell:

```bash
# Option A: Use gcloud to copy file
gcloud cloud-shell scp deploy_route_b_complete.sh cloudshell:~/

# Option B: In Cloud Shell, clone/download your repo
git clone <your-repo-url>
cd <repo-directory>
```

### Step 2: Run Infrastructure Setup (Cloud Shell)

This creates VPC connector, firewall rules, and configures Cloud Run:

```bash
# Make script executable
chmod +x deploy_route_b_complete.sh

# Run the setup
bash deploy_route_b_complete.sh
```

**Expected Output**:
```
🚀 Starting Route B Production Setup for nanoeng-fe538
==================================================

📡 PHASE 1: Creating VPC Connector...
✅ Connector created

🔥 PHASE 2: Configuring Firewall Rules...
✅ Postgres firewall rule created
✅ Redis firewall rule created

☁️  PHASE 3: Updating Cloud Run Service...
✅ Cloud Run updated with VPC connector

🔐 PHASE 4: Setting Environment Variables...
✅ Environment variables configured

👤 PHASE 5: Verifying Service Account Permissions...
✅ Service account permissions verified

==================================================
✅ Route B Setup Complete!
==================================================
```

**Time**: ~5-7 minutes (mostly waiting for VPC connector creation)

### Step 3: Deploy Updated Code (Local Machine)

Now deploy the code changes (PRIVATE_RANGES_ONLY egress setting):

```bash
cd /Users/avirammizrahi/Desktop/falkorDB

# Deploy functions with updated configuration
firebase deploy --only functions --force
```

**Time**: ~2-3 minutes

### Step 4: Run Schema Alignment

Create the `core.*` view aliases in production Postgres:

```bash
curl -X POST https://nanoeng-fe538.web.app/admin/sync-schema \
  -H "Content-Type: application/json" \
  -d '{"password":"align-schema-2026"}'
```

**Expected Output**:
```json
{
  "status": "success",
  "message": "Schema alignment COMPLETE",
  "views": ["operations", "required_tools", "machine_magazine", ...]
}
```

### Step 5: Run Acceptance Tests

```bash
chmod +x test_production.sh
bash test_production.sh
```

**Expected Output**:
```
🧪 Running Production Acceptance Tests
=======================================

Test 1: Health Check (/ping)
✅ PASS - Status: 200

Test 2: FalkorDB Connectivity (/testdb)
✅ PASS - Status: 200

Test 3: QueryWeaver SQL-Only Route
✅ PASS - Status: 200

Test 4: QueryWeaver Hybrid Route (SQL + Cypher)
✅ PASS - Status: 200

Test 5: Chat Wrapper Endpoint (/query)
✅ PASS - Status: 200

=======================================
✅ ALL TESTS PASSED (5/5)
=======================================

System Status: PRODUCTION READY ✅
```

### Step 6: Verify UI (Manual Test)

1. Open https://nanoeng-fe538.web.app/
2. Open DevTools → Network tab
3. Send a message: "Show tool usage for job J26-00010"
4. Verify:
   - ✅ Request goes to `/query` (same domain, not localhost)
   - ✅ Status 200
   - ✅ UI renders answer + suggestion buttons

---

## Troubleshooting

### If Tests Fail

**Check Cloud Run Logs**:
```bash
firebase functions:log --only api --lines 50
```

**Verify VPC Connector**:
```bash
gcloud compute networks vpc-access connectors describe shop-intel-connector \
  --region us-central1 --project nanoeng-fe538
```

**Check Firewall Rules**:
```bash
gcloud compute firewall-rules list \
  --project nanoeng-fe538 \
  --filter='name~connector'
```

**Common Issues**:

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED` | VPC connector not attached or firewall blocking | Re-run `deploy_route_b_complete.sh` |
| `relation does not exist` | Schema alignment not run | Run `/admin/sync-schema` |
| HTML returned for `/ping` | Hosting rewrites wrong | Redeploy hosting: `firebase deploy --only hosting` |
| Timeout errors | Database not listening on private IP | Check docker-compose on VM |

---

## What Gets Created

**Networking**:
- VPC Connector: `shop-intel-connector` (`10.8.0.0/28`)
- Firewall Rule: `allow-postgres-from-connector` (port 5432)
- Firewall Rule: `allow-redis-from-connector` (port 6379)

**Cloud Run Updates**:
- Service: `api`
- VPC Connector: `shop-intel-connector`
- Egress: `PRIVATE_RANGES_ONLY`
- Environment Variables: `GRAPH_NAME`, `QUERYWEAVER_CONFIG_PATH`, `GCP_PROJECT`, `GCP_REGION`, `GEMINI_MODEL`

**Secrets** (updated to private IPs):
- `POSTGRES_URL`: `postgresql://shop_user:shop_pass@10.128.0.2:5432/shop?sslmode=prefer`
- `FALKORDB_URL`: `redis://10.128.0.2:6379`

**Database** (Postgres):
- Schema: `core.*` (aliases to `qw.*` views)

---

## Quick Reference Commands

**Deploy Everything**:
```bash
# 1. Infrastructure (Cloud Shell)
bash deploy_route_b_complete.sh

# 2. Code (Local)
firebase deploy --only functions --force

# 3. Schema (Local)
curl -X POST https://nanoeng-fe538.web.app/admin/sync-schema \
  -H "Content-Type: application/json" \
  -d '{"password":"align-schema-2026"}'

# 4. Test (Local)
bash test_production.sh
```

**Monitor Logs**:
```bash
firebase functions:log --only api --lines 50
```

**Check Specific Test**:
```bash
curl -s https://nanoeng-fe538.web.app/ping | jq '.'
curl -s https://nanoeng-fe538.web.app/testdb | jq '.'
```

---

## Success Criteria

System is production-ready when:

- ✅ All 5 acceptance tests pass
- ✅ UI loads and sends requests to `/query` (not localhost)
- ✅ Cloud Run logs show no `ECONNREFUSED` errors
- ✅ VPC connector state is `READY`
- ✅ Chat queries return answers + suggestions

---

## Contact / Support

If you encounter issues:

1. Run `test_production.sh` and note which test fails
2. Check Cloud Run logs for specific error messages
3. Verify each component individually (VPC connector, firewall, database)
4. Consult the troubleshooting section above
