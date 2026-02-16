#!/bin/bash
# Deploy all Vektar contracts to testnets
# Run from packages/contracts directory

set -e  # Exit on error

echo "=========================================="
echo "Vektar Contract Deployment Script"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f "../../.env" ]; then
    echo "Error: .env file not found in project root"
    echo "Please copy env.template to .env and fill in your values"
    exit 1
fi

# Source environment variables
export $(grep -v '^#' ../../.env | xargs)

# Check if private key is set
if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY not set in .env"
    exit 1
fi

# Check if RPC URLs are set
if [ -z "$POLYGON_TESTNET_RPC_URL" ] || [ -z "$BASE_RPC_URL" ]; then
    echo "Error: RPC URLs not set in .env"
    echo "Please set POLYGON_TESTNET_RPC_URL and BASE_RPC_URL"
    exit 1
fi

echo "Step 1/2: Deploying CollateralEscrow to Polygon Amoy..."
echo "--------------------------------------------------------"
forge script script/DeployPolygon.s.sol \
    --rpc-url $POLYGON_TESTNET_RPC_URL \
    --broadcast \
    --verify \
    -vvvv

if [ $? -ne 0 ]; then
    echo ""
    echo "Warning: Verification may have failed. You can verify manually later."
    echo "Continuing with deployment..."
fi

echo ""
echo "Step 2/2: Deploying HorizonVault to Base Sepolia..."
echo "----------------------------------------------------"
forge script script/DeployBase.s.sol \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --verify \
    -vvvv

if [ $? -ne 0 ]; then
    echo ""
    echo "Warning: Verification may have failed. You can verify manually later."
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Contract addresses have been logged above."
echo ""
echo "Next Steps:"
echo "1. Copy the contract addresses from the logs"
echo "2. Update vekta/apps/cre-workflow/vektar-engine/config.json:"
echo "   - polygon.escrowAddress: <CollateralEscrow address>"
echo "   - base.vaultAddress: <HorizonVault address>"
echo "3. Update vekta/.env:"
echo "   - COLLATERAL_ESCROW_ADDRESS: <CollateralEscrow address>"
echo "   - HORIZON_VAULT_ADDRESS: <HorizonVault address>"
echo "4. After deploying CRE workflow, update CRE_FORWARDER_ADDRESS in .env"
echo "5. Redeploy contracts with actual CRE forwarder if needed"
echo ""
echo "To test CRE workflow:"
echo "  cd ../../apps/cre-workflow"
echo "  cre workflow simulate vektar-engine --non-interactive --trigger-index 0 --target local-simulation"
echo ""
