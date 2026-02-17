#!/bin/bash
# Initialize market with starting LTV on Base Sepolia

set -e

echo "=========================================="
echo "Initializing Market on Base Sepolia"
echo "=========================================="
echo ""

# Load env from workspace root
if [ -f ../../.env ]; then
    export $(grep -v '^#' ../../.env | xargs)
fi

# Contract addresses
VAULT_ADDRESS="0xe7e8cf57f36eeb9a16fcd285c1973218bb5129f3"
TOKEN_ID="56078938060096976448086754249497300447360333783952000147427828224794011030104"

# Initial LTV: 5000 bps = 50% (conservative starting point)
INITIAL_LTV_BPS="5000"

# Empty proof for manual initialization (in production, only CRE can call this)
PROOF="0x"

echo "Vault: $VAULT_ADDRESS"
echo "Token ID: $TOKEN_ID"
echo "Initial LTV: 50% (5000 bps)"
echo ""

if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env"
    exit 1
fi

if [ -z "$BASE_RPC_URL" ]; then
    echo "❌ Error: BASE_RPC_URL not set in .env"
    exit 1
fi

echo "Note: In production, only CRE forwarder can call updateMarketLTV."
echo "For testing, the deployer can call it directly."
echo ""
echo "Calling HorizonVault.updateMarketLTV()..."
echo ""

cast send $VAULT_ADDRESS \
    "updateMarketLTV(uint256,uint256,bytes)" \
    $TOKEN_ID \
    $INITIAL_LTV_BPS \
    $PROOF \
    --rpc-url $BASE_RPC_URL \
    --private-key $PRIVATE_KEY

echo ""
echo "✅ Market initialized successfully!"
echo ""
echo "Verify market data:"
cast call $VAULT_ADDRESS \
    "markets(uint256)(uint256,uint256,uint256,bool)" \
    $TOKEN_ID \
    --rpc-url $BASE_RPC_URL

echo ""
echo "Market LTV should now show 50% (5000 bps) on the dashboard"
echo "CRE workflow can now update it dynamically every 12 seconds"
