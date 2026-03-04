#!/bin/bash
# Continuous CRE Workflow Runner
# Simulates production DON execution by running workflow every 12 seconds
# Per Chainlink guidance: simulation with --broadcast is valid for hackathon demos
#
# Usage:
#   ./run-continuous.sh           # Normal mode (real Polymarket data)
#   ./run-continuous.sh thin      # Thin liquidity scenario
#   ./run-continuous.sh crisis    # Crisis scenario

set -euo pipefail

# Get scenario from argument (default: normal)
SCENARIO=${1:-normal}

echo "=========================================="
echo "Vektar CRE Workflow - Continuous Runner"
echo "=========================================="
echo ""
echo "Scenario: $SCENARIO"
echo ""
echo "This script simulates a production CRE DON deployment"
echo "by running the workflow every 12 seconds with --broadcast flag."
echo ""
echo "Press Ctrl+C to stop"
echo ""
sleep 2

# Script is already in apps/cre-workflow, so just stay in current directory
cd "$(dirname "$0")"

# Load .env and require CRE private key for broadcast mode
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${CRE_ETH_PRIVATE_KEY:?CRE_ETH_PRIVATE_KEY is required in apps/cre-workflow/.env}"

# Set scenario in config
jq --arg scenario "$SCENARIO" '.demo.scenario = $scenario' vektar-engine/config.json > vektar-engine/config.json.tmp && \
  mv vektar-engine/config.json.tmp vektar-engine/config.json

echo "✅ Config set to: $SCENARIO"
echo ""

CYCLE=0
START_TIME=$(date +%s)

while true; do
  CYCLE=$((CYCLE + 1))
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  echo ""
  echo "=========================================="
  echo "🔄 Cycle #$CYCLE | Uptime: ${ELAPSED}s"
  echo "$(date '+%Y-%m-%d %H:%M:%S')"
  echo "=========================================="
  echo ""
  
  # Run the workflow (show ALL output for rich logging)
  cre workflow simulate vektar-engine \
    --non-interactive \
    --trigger-index 0 \
    --target local-simulation \
    --broadcast 2>&1 | grep -v "Update available" || true
  
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Cycle #$CYCLE completed successfully"
  else
    echo ""
    echo "⚠️  Cycle #$CYCLE had issues (exit code: $EXIT_CODE)"
  fi
  
  echo ""
  echo "💤 Sleeping 12 seconds until next cycle..."
  echo ""
  
  sleep 12
done
