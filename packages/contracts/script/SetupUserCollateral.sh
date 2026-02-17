#!/bin/bash
# Setup user collateral and open borrowing position
# This script handles the complete user setup flow:
# 1. Mint test tokens on Polygon
# 2. Approve escrow contract
# 3. Deposit collateral to escrow
# 4. Open borrowing position on Base
# Run from packages/contracts directory

set -e

echo "=========================================="
echo "User Collateral Setup"
echo "=========================================="
echo ""

# Load env
if [ ! -f "../../.env" ]; then
    echo "❌ Error: .env file not found"
    exit 1
fi

export $(grep -v '^#' ../../.env | xargs)

# Validate required env vars
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env"
    exit 1
fi

if [ -z "$POLYGON_TESTNET_RPC_URL" ]; then
    echo "❌ Error: POLYGON_TESTNET_RPC_URL not set in .env"
    exit 1
fi

if [ -z "$BASE_RPC_URL" ]; then
    echo "❌ Error: BASE_RPC_URL not set in .env"
    exit 1
fi

# Get addresses from .env or arguments
MOCK_CTF="${MOCK_CTF_ADDRESS:-}"
ESCROW_ADDRESS="${COLLATERAL_ESCROW_ADDRESS:-}"
VAULT_ADDRESS="${HORIZON_VAULT_ADDRESS:-}"

if [ -z "$MOCK_CTF" ] || [ -z "$ESCROW_ADDRESS" ] || [ -z "$VAULT_ADDRESS" ]; then
    echo "❌ Error: Contract addresses not found in .env"
    echo "Please run DeployAll.sh first to deploy contracts"
    exit 1
fi

# Configuration
USER_ADDRESS=$(cast wallet address $PRIVATE_KEY)
TOKEN_ID="56078938060096976448086754249497300447360333783952000147427828224794011030104"
AMOUNT="20000000000000000000000" # 20,000 tokens (1e18 decimals)
DEBT_AMOUNT="5000000000" # 5,000 USDC (1e6 decimals)

echo "📋 Configuration:"
echo "   User:       $USER_ADDRESS"
echo "   MockCTF:    $MOCK_CTF"
echo "   Escrow:     $ESCROW_ADDRESS"
echo "   Vault:      $VAULT_ADDRESS"
echo "   Token ID:   ${TOKEN_ID:0:20}...${TOKEN_ID: -20}"
echo "   Amount:     20,000 tokens"
echo "   Debt:       5,000 USDC"
echo ""

# Step 1: Check existing balance
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/4: Check existing balance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

EXISTING_BALANCE=$(cast call $MOCK_CTF \
    "balanceOf(address,uint256)(uint256)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $POLYGON_TESTNET_RPC_URL)

echo "Existing balance: $EXISTING_BALANCE"

if [ "$EXISTING_BALANCE" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo "No tokens found. Minting..."
    
    cast send $MOCK_CTF \
        "mint(address,uint256,uint256)" \
        $USER_ADDRESS \
        $TOKEN_ID \
        $AMOUNT \
        --rpc-url $POLYGON_TESTNET_RPC_URL \
        --private-key $PRIVATE_KEY > /dev/null
    
    echo "✅ Tokens minted"
else
    echo "✅ Tokens already exist"
fi

echo ""

# Step 2: Approve escrow
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2/4: Approve CollateralEscrow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

IS_APPROVED=$(cast call $MOCK_CTF \
    "isApprovedForAll(address,address)(bool)" \
    $USER_ADDRESS \
    $ESCROW_ADDRESS \
    --rpc-url $POLYGON_TESTNET_RPC_URL)

if [ "$IS_APPROVED" = "false" ]; then
    echo "Setting approval..."
    
    cast send $MOCK_CTF \
        "setApprovalForAll(address,bool)" \
        $ESCROW_ADDRESS \
        true \
        --rpc-url $POLYGON_TESTNET_RPC_URL \
        --private-key $PRIVATE_KEY > /dev/null
    
    echo "✅ Escrow approved"
else
    echo "✅ Already approved"
fi

echo ""

# Step 3: Deposit to escrow
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3/4: Deposit collateral to escrow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LOCKED_BALANCE=$(cast call $ESCROW_ADDRESS \
    "getLockedBalance(address,uint256)(uint256)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $POLYGON_TESTNET_RPC_URL)

echo "Current locked balance: $LOCKED_BALANCE"

if [ "$LOCKED_BALANCE" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo "Depositing collateral..."
    
    TX_HASH=$(cast send $ESCROW_ADDRESS \
        "depositCollateral(uint256,uint256)" \
        $TOKEN_ID \
        $AMOUNT \
        --rpc-url $POLYGON_TESTNET_RPC_URL \
        --private-key $PRIVATE_KEY | grep "transactionHash" | awk '{print $2}')
    
    echo "✅ Collateral deposited"
    echo "   Tx: https://amoy.polygonscan.com/tx/$TX_HASH"
else
    echo "✅ Collateral already deposited"
fi

echo ""

# Step 4: Open position on Base
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4/4: Open borrowing position on Base"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if position already exists
EXISTING_POSITION=$(cast call $VAULT_ADDRESS \
    "positions(address,uint256)(uint256,uint256,uint256,uint256,bool,uint256,address)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $BASE_RPC_URL 2>/dev/null || echo "0")

# Extract collateralAmount (first uint256 in the tuple after tokenId)
POSITION_COLLATERAL=$(echo "$EXISTING_POSITION" | head -n 2 | tail -n 1)

if [ "$POSITION_COLLATERAL" = "0" ] || [ -z "$POSITION_COLLATERAL" ]; then
    echo "Opening position on Base..."
    
    TX_HASH=$(cast send $VAULT_ADDRESS \
        "openPosition(address,uint256,uint256,uint256,address)" \
        $USER_ADDRESS \
        $TOKEN_ID \
        $AMOUNT \
        $DEBT_AMOUNT \
        $USER_ADDRESS \
        --rpc-url $BASE_RPC_URL \
        --private-key $PRIVATE_KEY 2>&1 | grep "transactionHash" | awk '{print $2}')
    
    echo "✅ Position opened on Base"
    echo "   Tx: https://sepolia.basescan.org/tx/$TX_HASH"
else
    echo "✅ Position already exists on Base"
fi

echo ""

# Final verification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FINAL_BALANCE=$(cast call $MOCK_CTF \
    "balanceOf(address,uint256)(uint256)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $POLYGON_TESTNET_RPC_URL)

FINAL_LOCKED=$(cast call $ESCROW_ADDRESS \
    "getLockedBalance(address,uint256)(uint256)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $POLYGON_TESTNET_RPC_URL)

VAULT_POSITION=$(cast call $VAULT_ADDRESS \
    "positions(address,uint256)(uint256,uint256,uint256,uint256,bool,uint256,address)" \
    $USER_ADDRESS \
    $TOKEN_ID \
    --rpc-url $BASE_RPC_URL 2>/dev/null || echo "0")

echo "Polygon Escrow:"
echo "  User balance:    $FINAL_BALANCE"
echo "  Locked balance:  $FINAL_LOCKED"
echo ""
echo "Base Vault:"
if [ "$VAULT_POSITION" != "0" ]; then
    echo "  Position exists: ✅"
    VAULT_COLLATERAL=$(echo "$VAULT_POSITION" | head -n 2 | tail -n 1)
    VAULT_DEBT=$(echo "$VAULT_POSITION" | head -n 3 | tail -n 1)
    echo "  Collateral:      $VAULT_COLLATERAL"
    echo "  Debt:            $VAULT_DEBT"
else
    echo "  Position exists: ❌"
fi
echo ""

if [ "$FINAL_LOCKED" != "0x0000000000000000000000000000000000000000000000000000000000000000" ] && [ "$VAULT_POSITION" != "0" ]; then
    echo "✅ Setup Complete!"
    echo ""
    echo "📝 Next Steps:"
    echo "   1. Run CRE workflow: cd ../../apps/cre-workflow && ./run-continuous.sh"
    echo "   2. View dashboard: http://localhost:5173"
    echo "   3. Watch Dynamic LTV updates every 12 seconds"
else
    echo "❌ Setup incomplete"
    if [ "$FINAL_LOCKED" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
        echo "   - No collateral locked on Polygon"
    fi
    if [ "$VAULT_POSITION" = "0" ]; then
        echo "   - No position opened on Base"
    fi
    exit 1
fi
