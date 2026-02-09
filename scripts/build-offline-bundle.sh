#!/usr/bin/env bash
set -euo pipefail
# Build an offline bundle for air-gapped DGX Spark deployment
# Run this in a CONNECTED environment, then ship the bundle to the target

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

OUT="${1:-offline_bundle}"
mkdir -p "$OUT/images" "$OUT/config" "$OUT/scripts" "$OUT/data" "$OUT/manifest"

echo "============================================"
echo " Building Offline Bundle: $OUT"
echo "============================================"

# 1) Save Docker images
echo ""
echo "[1/5] Saving Docker images..."
for img in \
  postgres:16-alpine \
  falkordb/falkordb:latest \
  shopintel-local-backend:latest \
  shopintel-local-frontend:latest; do
  FNAME=$(echo "$img" | tr '/:' '_').tar
  echo "  Saving $img -> $FNAME"
  docker save "$img" > "$OUT/images/$FNAME"
done

# 2) Copy configs
echo ""
echo "[2/5] Copying configuration..."
cp docker-compose.local.yml "$OUT/config/"
cp .env "$OUT/config/"
cp -r config/ "$OUT/config/queryweaver/"

# 3) Copy scripts
echo ""
echo "[3/5] Copying scripts..."
cp scripts/*.sh "$OUT/scripts/"

# 4) Copy data
echo ""
echo "[4/5] Copying data..."
cp -r data/ "$OUT/data/"
cp -r db/ "$OUT/config/db/"
[ -f antigravity_shop_intelligence_bundle/inputs/solidcam_graph_simulated_production.xlsx ] && \
  cp antigravity_shop_intelligence_bundle/inputs/solidcam_graph_simulated_production.xlsx "$OUT/data/"

# 5) Generate manifest with checksums
echo ""
echo "[5/5] Generating manifest..."
python3 - << 'PY'
import hashlib, json, os
from pathlib import Path

out = Path(os.environ.get("OUT", "offline_bundle"))
entries = []
for p in sorted(out.rglob("*")):
    if p.is_file():
        h = hashlib.sha256()
        with p.open("rb") as f:
            for chunk in iter(lambda: f.read(1024*1024), b""):
                h.update(chunk)
        entries.append({
            "path": str(p.relative_to(out)),
            "sha256": h.hexdigest(),
            "bytes": p.stat().st_size
        })

manifest = {"version": "1.0.0", "created": __import__("datetime").datetime.utcnow().isoformat(), "files": entries}
(out / "manifest" / "manifest.json").write_text(json.dumps(manifest, indent=2))

with open(out / "manifest" / "sha256sum.txt", "w") as f:
    for e in entries:
        f.write(f"{e['sha256']}  {e['path']}\n")

total_mb = sum(e["bytes"] for e in entries) / 1024 / 1024
print(f"  {len(entries)} files, {total_mb:.1f} MB total")
PY

echo ""
echo "============================================"
echo " Bundle ready: $OUT/"
echo " Ship to DGX Spark and run:"
echo "   cd $OUT"
echo "   bash scripts/run-all.sh"
echo "============================================"
