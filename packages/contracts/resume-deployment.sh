#!/bin/bash
# Resume deployment: Just openPosition + update configs
# Use this when you already have contracts deployed and collateral deposited

set -euo pipefail
cd "$(dirname "$0")"

fail() {
  echo "" >&2
  echo "❌ FAILED: $1" >&2
  echo "   $2" >&2
  exit 1
}

echo "=========================================="
echo "🔄 Resume Deployment"
echo "=========================================="
echo ""

# Load env
if [ ! -f ".env" ]; then
  fail "Load env" ".env file not found!"
fi
set -a; source .env; set +a

USER_ADDRESS=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "🔑 User: $USER_ADDRESS"
echo ""

# Get deployed contract addresses from recent terminal output or manual input
echo "Enter deployed contract addresses:"
read -p "MockCTF address: " MOCK_CTF_ADDRESS
read -p "Escrow address: " ESCROW_ADDRESS
read -p "Vault address: " VAULT_ADDRESS

echo ""
echo "📋 Using addresses:"
echo "   MockCTF: $MOCK_CTF_ADDRESS"
echo "   Escrow:  $ESCROW_ADDRESS"
echo "   Vault:   $VAULT_ADDRESS"
echo ""

# Constants
TOKEN_ID="56078938060096976448086754249497300447360333783952000147427828224794011030104"
AMOUNT="20000000000000000000000"
DEBT_AMOUNT="5000000000"

# Check if position already exists
echo "Checking if position exists..."
set +e
POSITION_CHECK=$(cast call "$VAULT_ADDRESS" \
  "positions(address,uint256)" \
  "$USER_ADDRESS" "$TOKEN_ID" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" 2>&1)
set -e

if echo "$POSITION_CHECK" | grep -q "0x"; then
  # Parse debt amount (3rd return value, uint256)
  EXISTING_DEBT=$(echo "$POSITION_CHECK" | sed -n '3p' | xargs)
  if [ -n "$EXISTING_DEBT" ] && [ "$EXISTING_DEBT" != "0" ] && [ "$EXISTING_DEBT" != "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo "⚠️  Position already exists"
    echo "Skipping openPosition..."
    SKIP_OPEN=true
  fi
fi

if [ "${SKIP_OPEN:-false}" = false ]; then
  echo "Opening position..."
  
  # Retry wrapper for nonce issues
  MAX_RETRIES=3
  RETRY=0
  SUCCESS=false
  
  while [ $RETRY -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
    BORROW_TX=$(cast send "$VAULT_ADDRESS" \
      "openPosition(address,uint256,uint256,uint256,address)" \
      "$USER_ADDRESS" "$TOKEN_ID" "$AMOUNT" "$DEBT_AMOUNT" "$USER_ADDRESS" \
      --rpc-url "$BASE_SEPOLIA_RPC_URL" \
      --private-key "$PRIVATE_KEY" \
      --json 2>&1 || true)
    
    TX_HASH=$(echo "$BORROW_TX" | jq -r '.transactionHash // empty' 2>/dev/null)
    
    if [ -n "$TX_HASH" ]; then
      echo "✅ Position opened | TX: $TX_HASH"
      SUCCESS=true
    else
      if echo "$BORROW_TX" | grep -q "nonce too low"; then
        RETRY=$((RETRY + 1))
        echo "   ⚠️  Nonce issue (attempt $RETRY/$MAX_RETRIES), waiting 5s..." >&2
        sleep 5
      else
        echo "$BORROW_TX" >&2
        fail "Open position" "Transaction failed after $RETRY retries"
      fi
    fi
  done
  
  if [ "$SUCCESS" = false ]; then
    fail "Open position" "Max retries exceeded"
  fi
fi

echo ""
echo "=========================================="
echo "Step 2/2: Update Configs"
echo "=========================================="

# Save deployment JSON
cat > .latest-deployment.json << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployer": "$USER_ADDRESS",
  "polygon": {
    "network": "amoy",
    "mockCTFAddress": "$MOCK_CTF_ADDRESS",
    "escrowAddress": "$ESCROW_ADDRESS"
  },
  "base": {
    "network": "sepolia",
    "vaultAddress": "$VAULT_ADDRESS",
    "maxLtvIncrease": 10000
  },
  "market": {
    "tokenId": "$TOKEN_ID",
    "collateralAmount": "$AMOUNT",
    "debtAmount": "$DEBT_AMOUNT"
  }
}
EOF

echo "✅ Saved .latest-deployment.json"

# Update all configs
./update-config.sh

echo ""
echo "=========================================="
echo "🎉 DEPLOYMENT RESUMED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   MockCTF:    $MOCK_CTF_ADDRESS"
echo "   Escrow:     $ESCROW_ADDRESS"
echo "   Vault:      $VAULT_ADDRESS"
echo "   User:       $USER_ADDRESS"
echo "   Collateral: 20,000 tokens"
echo "   Debt:       \$5,000 USDC"
echo ""
echo "🎬 Next: Start CRE workflow and dashboard"
echo "  1. cd ../../apps/cre-workflow && ./run-continuous.sh normal"
echo "  2. cd ../../apps/dashboard && npm run dev"
echo ""
