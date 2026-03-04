#!/bin/bash
# Run with THIN liquidity scenario (mock data)
# Shows dramatic LTV drop to ~35%

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

# Update config to use thin scenario
jq '.demo.scenario = "thin"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo "=========================================="
echo "📉 Running with THIN liquidity scenario"
echo "=========================================="
echo ""
echo "Mock order book:"
echo "  - Only ~\$1,200 total liquidity"
echo "  - Best bid: \$0.41 (50 shares)"
echo "  - Expected LTV: ~35%"
echo "  - Likely to trigger liquidation"
echo ""

cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 0 \
  --target local-simulation \
  --broadcast 2>&1 | grep -v "Update available" || true

# Reset back to normal
jq '.demo.scenario = "normal"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo ""
echo "✅ Cycle completed (config reset to normal)"
