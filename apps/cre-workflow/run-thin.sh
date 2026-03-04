#!/bin/bash
# Run one settlement oracle cycle with THIN liquidity scenario
# Real order book data transformed: 90% liquidity drain
# Settlement value drops sharply even though spot price is unchanged

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a && source .env && set +a
fi

if [ -z "$CRE_ETH_PRIVATE_KEY" ]; then
  echo "Error: CRE_ETH_PRIVATE_KEY is not set. Add it to apps/cre-workflow/.env"
  exit 1
fi

jq '.demo.scenario = "thin"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo "=========================================="
echo "📉 Settlement Oracle — Thin Liquidity"
echo "=========================================="
echo ""
echo "Transformation applied to real order book:"
echo "  - 90% liquidity drain (10% of real bids survive)"
echo "  - Prices unchanged — only depth is reduced"
echo "  - Settlement value drops proportionally"
echo "  - Spot price unchanged — gap widens"
echo ""

cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 0 \
  --target local-simulation \
  --broadcast 2>&1 | grep -v "Update available" || true

jq '.demo.scenario = "normal"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo ""
echo "✅ Cycle completed (config reset to normal)"
