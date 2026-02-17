#!/bin/bash
# Create a test position for dashboard demo

set -e

echo "=========================================="
echo "Creating Test Position on Base Sepolia"
echo "=========================================="
echo ""

# Load env from workspace root
if [ -f ../../.env ]; then
    export $(grep -v '^#' ../../.env | xargs)
fi

# Contract addresses (from dashboard .env.local)
VAULT_ADDRESS="0xe7e8cf57f36eeb9a16fcd285c1973218bb5129f3"
USER_ADDRESS="0x311e26702ABa231c321C633d1ff6ecB4445f2308"
TOKEN_ID="56078938060096976448086754249497300447360333783952000147427828224794011030104"

# Position parameters
COLLATERAL_AMOUNT="20000000000000000000000" # 20,000 shares (18 decimals)
DEBT_AMOUNT="5000000000" # 5,000 USDC (6 decimals)
POLYGON_ADDRESS="0x311e26702ABa231c321C633d1ff6ecB4445f2308"

echo "Vault: $VAULT_ADDRESS"
echo "User: $USER_ADDRESS"
echo "Token ID: $TOKEN_ID"
echo "Collateral: 20,000 shares"
echo "Debt: 5,000 USDC"
echo ""

if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env"
    exit 1
fi

if [ -z "$BASE_RPC_URL" ]; then
    echo "❌ Error: BASE_RPC_URL not set in .env"
    exit 1
fi

echo "Calling HorizonVault.openPosition()..."
echo ""

cast send $VAULT_ADDRESS \
    "openPosition(address,uint256,uint256,uint256,address)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    $COLLATERAL_AMOUNT \
    $DEBT_AMOUNT \
    $POLYGON_ADDRESS \
    --rpc-url $BASE_RPC_URL \
    --private-key $PRIVATE_KEY

echo ""
echo "✅ Position created successfully!"
echo ""
echo "Verify on Base Sepolia:"
echo "https://sepolia.basescan.org/address/$VAULT_ADDRESS"
echo ""
echo "Check position:"
cast call $VAULT_ADDRESS \
    "positions(address,uint256)(uint256,uint256,uint256,uint256,bool,uint256,address)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $BASE_RPC_URL
