#!/bin/bash
# Run one settlement oracle cycle with real Polymarket order book data

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a && source .env && set +a
fi

if [ -z "$CRE_ETH_PRIVATE_KEY" ]; then
  echo "Error: CRE_ETH_PRIVATE_KEY is not set. Add it to apps/cre-workflow/.env"
  exit 1
fi

jq '.demo.scenario = "normal"' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo "=========================================="
echo "📊 Settlement Oracle — Normal Market"
echo "=========================================="
echo ""
echo "Fetching live Polymarket order book..."
echo "VWAP + safety margin → settlementValueUSDC"
echo "Writing signed report to SettlementVault on Base"
echo ""

cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 0 \
  --target local-simulation \
  --broadcast 2>&1 | grep -v "Update available" || true

echo ""
echo "✅ Cycle completed"
