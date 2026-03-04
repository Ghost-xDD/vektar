#!/bin/bash
# Master deployment script: Deploy contracts + setup position + update configs
# This does everything in one go

set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "🚀 VEKTAR - Complete Deployment Pipeline"
echo "=========================================="
echo ""
echo "This will:"
echo "  1. Deploy contracts (demo mode)"
echo "  2. Setup test position"
echo "  3. Update all configs (CRE + Dashboard)"
echo ""
read -p "Ready to deploy? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Load environment variables
if [ -f ".env" ]; then
    echo "📦 Loading environment variables..."
    source .env
    echo "✅ Environment loaded"
else
    echo "❌ .env file not found!"
    echo "Run: cp .env.example .env and fill in your values"
    exit 1
fi

# Verify required vars
if [ -z "$PRIVATE_KEY" ] || [ -z "$BASE_SEPOLIA_RPC_URL" ] || [ -z "$POLYGON_AMOY_RPC_URL" ]; then
    echo "❌ Missing required environment variables"
    echo "Check your .env file"
    exit 1
fi

echo ""
echo "=========================================="
echo "Step 1/4: Deploy Contracts (Demo Mode)"
echo "=========================================="
./deploy-demo.sh

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "Step 2/4: Setup Test Position"
echo "=========================================="
echo ""
echo "⚠️  This requires CTF tokens on Polygon Amoy"
echo ""
read -p "Do you have CTF tokens? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./setup-position.sh
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Position setup failed, but continuing..."
    fi
else
    echo "⏭️  Skipping position setup"
    echo "You can run this later: ./setup-position.sh"
fi

echo ""
echo "=========================================="
echo "Step 3/4: Update All Configurations"
echo "=========================================="
./update-config.sh

if [ $? -ne 0 ]; then
    echo "❌ Config update failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "Step 4/4: Verification"
echo "=========================================="
echo ""

# Load deployment info
ESCROW_ADDRESS=$(jq -r '.polygon.escrowAddress' .latest-deployment.json)
VAULT_ADDRESS=$(jq -r '.base.vaultAddress' .latest-deployment.json)
MAX_LTV=$(jq -r '.base.maxLtvIncrease' .latest-deployment.json)

echo "✅ Contracts deployed:"
echo "   Escrow: $ESCROW_ADDRESS"
echo "   Vault: $VAULT_ADDRESS"
echo "   Max LTV: $MAX_LTV bps"
echo ""

echo "✅ Configs updated:"
echo "   - apps/cre-workflow/vektar-engine/config.json"
echo "   - apps/cre-workflow/.env"
echo "   - apps/dashboard/.env.local"
echo ""

echo "=========================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "📝 Next Steps:"
echo ""
echo "  1. Test CRE workflow:"
echo "     cd ../../apps/cre-workflow"
echo "     ./run-normal.sh"
echo ""
echo "  2. Start continuous monitoring:"
echo "     ./run-continuous.sh"
echo ""
echo "  3. Start dashboard (in new terminal):"
echo "     cd ../../apps/dashboard"
echo "     bun dev"
echo "     # Open http://localhost:3000"
echo ""
echo "  4. Record video with scenarios:"
echo "     ./run-normal.sh   # Cycle 1: Real data"
echo "     ./run-thin.sh     # Cycle 2: Dramatic drop"
echo "     ./run-crisis.sh   # Cycle 3: Crisis mode"
echo ""
echo "🔗 Block Explorers:"
echo "   Polygon: https://amoy.polygonscan.com/address/$ESCROW_ADDRESS"
echo "   Base:    https://sepolia.basescan.org/address/$VAULT_ADDRESS"
echo ""
echo "💾 Deployment saved to: .latest-deployment.json"
echo ""
