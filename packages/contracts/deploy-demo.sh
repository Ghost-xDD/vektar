#!/bin/bash
# Deploy all contracts in DEMO MODE (instant LTV updates)
# MAX_LTV_INCREASE_PER_UPDATE = 10000 (100%)

set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "🎬 DEMO MODE DEPLOYMENT"
echo "=========================================="
echo ""
echo "This deploys contracts optimized for video demos:"
echo "  - MAX_LTV_INCREASE_PER_UPDATE: 10000 bps (100%, instant)"
echo "  - Collateral Escrow on Polygon Amoy"
echo "  - Horizon Vault on Base Sepolia"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Check for required env vars
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set"
    echo "Run: export PRIVATE_KEY=0x..."
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

echo ""
echo "Step 1: Deploy Collateral Escrow (Polygon Amoy)"
echo "================================================"
forge script script/DeployPolygon.s.sol \
    --rpc-url "$POLYGON_AMOY_RPC_URL" \
    --broadcast \
    --verify \
    -vvv

echo ""
echo "Extracting Polygon deployment addresses..."
POLYGON_LOG=$(ls -t broadcast/DeployPolygon.s.sol/80002/run-latest.json 2>/dev/null || echo "")
if [ -z "$POLYGON_LOG" ]; then
    echo "❌ Could not find Polygon deployment log"
    exit 1
fi

ESCROW_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "CollateralEscrow") | .contractAddress' "$POLYGON_LOG")
echo "✅ CollateralEscrow: $ESCROW_ADDRESS"

echo ""
echo "Step 2: Deploy Horizon Vault (Base Sepolia) - DEMO MODE"
echo "========================================================"
echo "Using MAX_LTV_INCREASE_PER_UPDATE=10000 (100%)"
echo ""

# Get deployer address (will be used as temporary forwarder)
DEPLOYER_ADDRESS=$(cast wallet address "$PRIVATE_KEY")
echo "Deployer (temp forwarder): $DEPLOYER_ADDRESS"

export MAX_LTV_INCREASE_PER_UPDATE=10000
export CRE_FORWARDER_ADDRESS=$DEPLOYER_ADDRESS

forge script script/DeployBase.s.sol \
    --rpc-url "$BASE_SEPOLIA_RPC_URL" \
    --broadcast \
    --verify \
    -vvv

echo ""
echo "Extracting Base deployment addresses..."
BASE_LOG=$(ls -t broadcast/DeployBase.s.sol/84532/run-latest.json 2>/dev/null || echo "")
if [ -z "$BASE_LOG" ]; then
    echo "❌ Could not find Base deployment log"
    exit 1
fi

VAULT_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "HorizonVault") | .contractAddress' "$BASE_LOG")
echo "✅ HorizonVault: $VAULT_ADDRESS"

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "📋 Deployed Contracts:"
echo "  Polygon Amoy:"
echo "    CollateralEscrow: $ESCROW_ADDRESS"
echo ""
echo "  Base Sepolia:"
echo "    HorizonVault: $VAULT_ADDRESS"
echo "    MAX_LTV_INCREASE: 10000 bps (100%, instant updates)"
echo ""
echo "🔗 Block Explorers:"
echo "  Polygon: https://amoy.polygonscan.com/address/$ESCROW_ADDRESS"
echo "  Base:    https://sepolia.basescan.org/address/$VAULT_ADDRESS"
echo ""
echo "📝 Next Steps:"
echo "  1. Run: ./setup-position.sh $ESCROW_ADDRESS $VAULT_ADDRESS"
echo "  2. Update config.json with these addresses"
echo "  3. Test with: cd ../../apps/cre-workflow && ./run-normal.sh"
echo ""

# Save addresses to file for easy reference
cat > .latest-deployment.json <<EOF
{
  "deploymentTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "network": "testnet",
  "mode": "demo",
  "polygon": {
    "chainId": 80002,
    "escrowAddress": "$ESCROW_ADDRESS",
    "explorer": "https://amoy.polygonscan.com/address/$ESCROW_ADDRESS"
  },
  "base": {
    "chainId": 84532,
    "vaultAddress": "$VAULT_ADDRESS",
    "maxLtvIncrease": 10000,
    "explorer": "https://sepolia.basescan.org/address/$VAULT_ADDRESS"
  },
  "deployer": "$DEPLOYER_ADDRESS"
}
EOF

echo "✅ Deployment info saved to .latest-deployment.json"
