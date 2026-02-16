#!/bin/bash
# Continuous CRE Workflow Runner
# Simulates production DON execution by running workflow every 12 seconds
# Per Chainlink guidance: simulation with --broadcast is valid for hackathon demos

set -e

echo "=========================================="
echo "Vektar CRE Workflow - Continuous Runner"
echo "=========================================="
echo ""
echo "This script simulates a production CRE DON deployment"
echo "by running the workflow every 12 seconds with --broadcast flag."
echo ""
echo "Press Ctrl+C to stop"
echo ""
sleep 2

# Script is already in apps/cre-workflow, so just stay in current directory
cd "$(dirname "$0")"

# Export the private key for broadcast mode
export CRE_ETH_PRIVATE_KEY=REDACTED_PRIVATE_KEY

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
