#!/bin/bash
# Set SettlementVault upward oracle cap (bps)
# Usage:
#   ./set-oracle-cap.sh <vault_address> <bps>
# Example (instant demo recovery):
#   ./set-oracle-cap.sh 0xYourVault 10000

set -euo pipefail

cd "$(dirname "$0")"

if [ $# -ne 2 ]; then
  echo "Usage: $0 <vault_address> <bps>" >&2
  echo "Example: $0 0xYourVault 10000" >&2
  exit 1
fi

VAULT_ADDRESS="$1"
BPS="$2"

if ! [[ "$BPS" =~ ^[0-9]+$ ]]; then
  echo "❌ bps must be an integer between 0 and 10000" >&2
  exit 1
fi

if [ "$BPS" -gt 10000 ]; then
  echo "❌ bps cannot be greater than 10000" >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "❌ .env file not found in packages/contracts" >&2
  exit 1
fi

set -a
source .env
set +a

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "❌ PRIVATE_KEY is not set in .env" >&2
  exit 1
fi

if [ -z "${BASE_SEPOLIA_RPC_URL:-}" ]; then
  echo "❌ BASE_SEPOLIA_RPC_URL is not set in .env" >&2
  exit 1
fi

echo "Updating oracle cap..."
echo "  Vault: $VAULT_ADDRESS"
echo "  New cap: $BPS bps"

TX_HASH=$(cast send "$VAULT_ADDRESS" \
  "setMaxValueIncreasePerUpdateBps(uint256)" \
  "$BPS" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --json | jq -r '.transactionHash // empty')

if [ -z "$TX_HASH" ]; then
  echo "❌ Failed to submit transaction" >&2
  exit 1
fi

CURRENT=$(cast call "$VAULT_ADDRESS" \
  "maxValueIncreasePerUpdateBps()(uint256)" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL")

echo "✅ Updated. TX: $TX_HASH"
echo "✅ Current cap: $CURRENT bps"
