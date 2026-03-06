#!/bin/bash
# Run one settlement oracle cycle with CRISIS liquidity scenario
# Real order book data transformed: 97% liquidity drain + 65% price decay
# Demonstrates: spot price $X, oracle collapses to ~$0.14 — the liquidity illusion in action

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a && source .env && set +a
fi

if [ -z "$CRE_ETH_PRIVATE_KEY" ]; then
  echo "Error: CRE_ETH_PRIVATE_KEY is not set. Add it to apps/cre-workflow/.env"
  exit 1
fi

jq '.demo.scenario = "crisis"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo "=========================================="
echo "🔥 Settlement Oracle — Crisis Scenario"
echo "=========================================="
echo ""
echo "Transformation applied to real order book:"
echo "  - 97% liquidity drain (3% of real bids survive)"
echo "  - 65% price decay (distressed sellers dump far below spot)"
echo "  - Result: oracle collapses from ~\$7,200 → ~\$2,500 total exit"
echo "  - Spot price unchanged — this is the liquidity illusion"
echo ""

cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 0 \
  --target local-simulation \
  --broadcast 2>&1 | grep -v "Update available" || true

# Reset to normal
jq '.demo.scenario = "normal"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo ""
echo "✅ Cycle completed (config reset to normal)"
