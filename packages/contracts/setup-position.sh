#!/bin/bash
# Setup test position: deposit collateral + open position
# This simulates the full user flow for demo/testing

set -e

cd "$(dirname "$0")"

ESCROW_ADDRESS=${1:-}
VAULT_ADDRESS=${2:-}

if [ -z "$ESCROW_ADDRESS" ] || [ -z "$VAULT_ADDRESS" ]; then
    echo "Usage: ./setup-position.sh <ESCROW_ADDRESS> <VAULT_ADDRESS>"
    echo ""
    echo "Or load from latest deployment:"
    if [ -f ".latest-deployment.json" ]; then
        ESCROW_ADDRESS=$(jq -r '.polygon.escrowAddress' .latest-deployment.json)
        VAULT_ADDRESS=$(jq -r '.base.vaultAddress' .latest-deployment.json)
        echo "  ESCROW: $ESCROW_ADDRESS"
        echo "  VAULT:  $VAULT_ADDRESS"
        echo ""
        read -p "Use these addresses? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        exit 1
    fi
fi

# Check for required env vars
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set"
    exit 1
fi

if [ -z "$BASE_SEPOLIA_RPC_URL" ]; then
    echo "❌ Error: BASE_SEPOLIA_RPC_URL not set"
    exit 1
fi

if [ -z "$POLYGON_AMOY_RPC_URL" ]; then
    echo "❌ Error: POLYGON_AMOY_RPC_URL not set"
    exit 1
fi

echo "=========================================="
echo "🎯 Setting Up Test Position"
echo "=========================================="
echo ""

USER_ADDRESS=$(cast wallet address "$PRIVATE_KEY")
echo "User: $USER_ADDRESS"
echo "Escrow: $ESCROW_ADDRESS"
echo "Vault: $VAULT_ADDRESS"
echo ""

# Market info
TOKEN_ID="56078938060096976448086754249497300447360333783952000147427828224794011030104"
COLLATERAL_AMOUNT="20000000000000000000000" # 20,000 tokens
DEBT_AMOUNT="5000000000" # 5,000 USDC (6 decimals)

echo "Market: Will Bitcoin reach \$100,000 by Dec 31, 2026?"
echo "Token ID: $TOKEN_ID"
echo "Collateral: 20,000 shares"
echo "Debt: 5,000 USDC"
echo ""

# Check if user needs test tokens
echo "Checking balances..."
CTF_ADDRESS="0x69308FB512518e39F9b16112fA8d994F4e2Bf8bB" # Polymarket CTF on Amoy

BALANCE=$(cast call $CTF_ADDRESS "balanceOf(address,uint256)(uint256)" $USER_ADDRESS $TOKEN_ID --rpc-url "$POLYGON_AMOY_RPC_URL" 2>/dev/null || echo "0")
echo "Current CTF balance: $(cast --from-wei $BALANCE) shares"

if [ "$BALANCE" = "0" ] || [ $(echo "$BALANCE < $COLLATERAL_AMOUNT" | bc) -eq 1 ]; then
    echo ""
    echo "⚠️  Insufficient CTF tokens"
    echo ""
    echo "To get test tokens:"
    echo "  1. Go to https://testnet.polymarket.com"
    echo "  2. Connect wallet on Polygon Amoy"
    echo "  3. Buy some shares of any market"
    echo "  OR"
    echo "  4. Use the faucet script (if available)"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "Step 1: Approve Escrow to transfer CTF tokens"
echo "=============================================="
cast send $CTF_ADDRESS \
    "setApprovalForAll(address,bool)" \
    $ESCROW_ADDRESS \
    true \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$POLYGON_AMOY_RPC_URL" \
    --gas-limit 100000

echo "✅ Approval granted"

echo ""
echo "Step 2: Deposit collateral to Escrow"
echo "====================================="
cast send $ESCROW_ADDRESS \
    "depositCollateral(uint256,uint256)" \
    $TOKEN_ID \
    $COLLATERAL_AMOUNT \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$POLYGON_AMOY_RPC_URL" \
    --gas-limit 500000

echo "✅ Collateral deposited"

echo ""
echo "Step 3: Open position on Vault (Base)"
echo "======================================"
cast send $VAULT_ADDRESS \
    "openPosition(address,uint256,uint256,uint256,address)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    $COLLATERAL_AMOUNT \
    $DEBT_AMOUNT \
    $USER_ADDRESS \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$BASE_SEPOLIA_RPC_URL" \
    --gas-limit 1000000

echo "✅ Position opened"

echo ""
echo "Step 4: Verify setup"
echo "===================="

echo ""
echo "Checking locked balance on Polygon..."
LOCKED=$(cast call $ESCROW_ADDRESS "getLockedBalance(address,uint256)(uint256)" $USER_ADDRESS $TOKEN_ID --rpc-url "$POLYGON_AMOY_RPC_URL")
echo "Locked collateral: $(cast --from-wei $LOCKED) shares"

echo ""
echo "Checking position on Base..."
POSITION=$(cast call $VAULT_ADDRESS "positions(address,uint256)(uint256,uint256,uint256,uint256,bool,uint256,address)" $USER_ADDRESS $TOKEN_ID --rpc-url "$BASE_SEPOLIA_RPC_URL")
echo "Position data: $POSITION"

echo ""
echo "=========================================="
echo "✅ Position Setup Complete!"
echo "=========================================="
echo ""
echo "📊 Position Summary:"
echo "  User: $USER_ADDRESS"
echo "  Collateral: 20,000 shares (locked on Polygon)"
echo "  Debt: 5,000 USDC"
echo "  Token ID: $TOKEN_ID"
echo ""
echo "🔗 View on Explorers:"
echo "  Polygon: https://amoy.polygonscan.com/address/$USER_ADDRESS"
echo "  Base:    https://sepolia.basescan.org/address/$USER_ADDRESS"
echo ""
echo "📝 Next Steps:"
echo "  1. Update apps/cre-workflow/vektar-engine/config.json:"
echo "     - escrowAddress: $ESCROW_ADDRESS"
echo "     - vaultAddress: $VAULT_ADDRESS"
echo "  2. Start dashboard: cd ../../apps/dashboard && bun dev"
echo "  3. Run CRE workflow: cd ../../apps/cre-workflow && ./run-normal.sh"
echo ""
