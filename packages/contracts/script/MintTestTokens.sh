#!/bin/bash
# Mint test CTF tokens to user on Polygon Amoy

set -e

echo "=========================================="
echo "Minting Test CTF Tokens"
echo "=========================================="
echo ""

# Load env
if [ -f ../../.env ]; then
    export $(grep -v '^#' ../../.env | xargs)
fi

# Configuration
MOCK_CTF="${1:-}"  # Pass as first argument or will prompt
USER_ADDRESS="${2:-0x311e26702ABa231c321C633d1ff6ecB4445f2308}"
TOKEN_ID="${3:-56078938060096976448086754249497300447360333783952000147427828224794011030104}"
AMOUNT="${4:-20000000000000000000000}"  # 20,000 tokens

if [ -z "$MOCK_CTF" ]; then
    echo "Usage: ./MintTestTokens.sh <MOCK_CTF_ADDRESS> [USER_ADDRESS] [TOKEN_ID] [AMOUNT]"
    echo ""
    echo "Example:"
    echo "  ./MintTestTokens.sh 0x123...abc"
    echo ""
    exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env"
    exit 1
fi

echo "MockCTF: $MOCK_CTF"
echo "User: $USER_ADDRESS"
echo "Token ID: $TOKEN_ID"
echo "Amount: 20,000 tokens (20000e18)"
echo ""

echo "Minting tokens..."
cast send $MOCK_CTF \
    "mint(address,uint256,uint256)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    $AMOUNT \
    --rpc-url $POLYGON_TESTNET_RPC_URL \
    --private-key $PRIVATE_KEY

echo ""
echo "✅ Tokens minted!"
echo ""

# Verify balance
echo "Verifying user balance:"
BALANCE=$(cast call $MOCK_CTF \
    "balanceOf(address,uint256)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $POLYGON_TESTNET_RPC_URL)

echo "Balance: $BALANCE (should be 20000e18)"
echo ""
echo "Next: Run ./ApproveAndDeposit.sh $MOCK_CTF"
