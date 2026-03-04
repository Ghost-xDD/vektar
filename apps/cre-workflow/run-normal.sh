#!/bin/bash
# Run with REAL Polymarket data (production mode)

set -e

cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
  set -a && source .env && set +a
fi

if [ -z "$CRE_ETH_PRIVATE_KEY" ]; then
  echo "Error: CRE_ETH_PRIVATE_KEY is not set. Add it to apps/cre-workflow/.env"
  exit 1
fi

# Ensure config is set to normal (in case it was changed)
jq '.demo.scenario = "normal"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo "=========================================="
echo "📊 Running with REAL Polymarket data"
echo "=========================================="
echo ""

cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 0 \
  --target local-simulation \
  --broadcast 2>&1 | grep -v "Update available" || true

echo ""
echo "✅ Cycle completed"
