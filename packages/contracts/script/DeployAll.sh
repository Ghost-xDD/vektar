#!/bin/bash
# Complete deployment script for Vektar demo
# Deploys: MockCTF -> CollateralEscrow -> HorizonVault
# Then sets up user collateral

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Vektar Complete Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change to contracts directory
cd "$(dirname "$0")/.."

# Check .env exists
if [ ! -f "../../.env" ]; then
    echo "❌ Error: .env file not found in project root"
    echo "Please copy env.template to .env and fill in your values"
    exit 1
fi

# Load environment
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

if [ -z "$CRE_FORWARDER_ADDRESS" ]; then
    echo "⚠️  Warning: CRE_FORWARDER_ADDRESS not set, using deployer address"
fi

# Get deployer info
DEPLOYER=$(cast wallet address $PRIVATE_KEY)
POLYGON_BALANCE=$(cast balance $DEPLOYER --rpc-url $POLYGON_TESTNET_RPC_URL)
BASE_BALANCE=$(cast balance $DEPLOYER --rpc-url $BASE_RPC_URL)

echo "📋 Deployment Info:"
echo "   Deployer:        $DEPLOYER"
echo "   Polygon Balance: $POLYGON_BALANCE wei (~$(cast --from-wei $POLYGON_BALANCE) POL)"
echo "   Base Balance:    $BASE_BALANCE wei (~$(cast --from-wei $BASE_BALANCE) ETH)"
echo "   CRE Forwarder:   ${CRE_FORWARDER_ADDRESS:-$DEPLOYER}"
echo ""

# Check minimum balances
MIN_POLYGON_BALANCE="100000000000000000" # 0.1 POL
MIN_BASE_BALANCE="10000000000000000"     # 0.01 ETH

if [ $(echo "$POLYGON_BALANCE < $MIN_POLYGON_BALANCE" | bc) -eq 1 ]; then
    echo "⚠️  Warning: Low Polygon balance. Get testnet POL from https://faucet.polygon.technology/"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

if [ $(echo "$BASE_BALANCE < $MIN_BASE_BALANCE" | bc) -eq 1 ]; then
    echo "⚠️  Warning: Low Base balance. Get testnet ETH from https://www.alchemy.com/faucets/base-sepolia"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Step 1/5: Deploy MockCTF (Polygon Amoy)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

forge script script/DeployMockCTF.s.sol \
    --rpc-url $POLYGON_TESTNET_RPC_URL \
    --broadcast \
    --slow 2>&1 | tee /tmp/vektar-deploy-mockctf.log

# Extract MockCTF address
MOCK_CTF=$(grep "MockCTF deployed at:" /tmp/vektar-deploy-mockctf.log | tail -1 | awk '{print $NF}')

if [ -z "$MOCK_CTF" ]; then
    echo "❌ Failed to extract MockCTF address from deployment logs"
    echo "Check /tmp/vektar-deploy-mockctf.log for details"
    exit 1
fi

# Verify deployment
echo "Verifying MockCTF deployment..."
CODE=$(cast code $MOCK_CTF --rpc-url $POLYGON_TESTNET_RPC_URL)
if [ "$CODE" == "0x" ]; then
    echo "❌ MockCTF not deployed properly (no bytecode at address)"
    exit 1
fi

echo "✅ MockCTF deployed: $MOCK_CTF"
echo ""

# Wait for block confirmation
echo "⏳ Waiting for block confirmation..."
sleep 5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Step 2/5: Deploy CollateralEscrow (Polygon Amoy)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Export MockCTF address for the escrow deployment
export MOCK_CTF_ADDRESS=$MOCK_CTF

forge script script/DeployMockEscrow.s.sol \
    --rpc-url $POLYGON_TESTNET_RPC_URL \
    --broadcast \
    --slow 2>&1 | tee /tmp/vektar-deploy-escrow.log

# Extract Escrow address
ESCROW_ADDRESS=$(grep "CollateralEscrow (MockCTF):" /tmp/vektar-deploy-escrow.log | tail -1 | awk '{print $NF}')

if [ -z "$ESCROW_ADDRESS" ]; then
    echo "❌ Failed to extract CollateralEscrow address from deployment logs"
    echo "Check /tmp/vektar-deploy-escrow.log for details"
    exit 1
fi

# Verify deployment
echo "Verifying CollateralEscrow deployment..."
CODE=$(cast code $ESCROW_ADDRESS --rpc-url $POLYGON_TESTNET_RPC_URL)
if [ "$CODE" == "0x" ]; then
    echo "❌ CollateralEscrow not deployed properly (no bytecode at address)"
    exit 1
fi

# Verify it points to correct MockCTF
CTF_EXCHANGE=$(cast call $ESCROW_ADDRESS "CTF_EXCHANGE()(address)" --rpc-url $POLYGON_TESTNET_RPC_URL)
if [ "$CTF_EXCHANGE" != "$MOCK_CTF" ]; then
    echo "❌ CollateralEscrow CTF_EXCHANGE mismatch!"
    echo "   Expected: $MOCK_CTF"
    echo "   Got:      $CTF_EXCHANGE"
    exit 1
fi

echo "✅ CollateralEscrow deployed: $ESCROW_ADDRESS"
echo "✅ Verified CTF_EXCHANGE points to MockCTF"
echo ""

# Wait for block confirmation
echo "⏳ Waiting for block confirmation..."
sleep 5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Step 3/5: Deploy HorizonVault (Base Sepolia)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

forge script script/DeployBase.s.sol \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --slow 2>&1 | tee /tmp/vektar-deploy-vault.log

# Extract Vault address
VAULT_ADDRESS=$(grep "HorizonVault:" /tmp/vektar-deploy-vault.log | grep "0x" | tail -1 | awk '{print $NF}')

if [ -z "$VAULT_ADDRESS" ]; then
    echo "❌ Failed to extract HorizonVault address from deployment logs"
    echo "Check /tmp/vektar-deploy-vault.log for details"
    exit 1
fi

# Verify deployment
echo "Verifying HorizonVault deployment..."
CODE=$(cast code $VAULT_ADDRESS --rpc-url $BASE_RPC_URL)
if [ "$CODE" == "0x" ]; then
    echo "❌ HorizonVault not deployed properly (no bytecode at address)"
    exit 1
fi

echo "✅ HorizonVault deployed: $VAULT_ADDRESS"
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Step 4/5: Update Configuration Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Update .env
echo "Updating .env..."
sed -i.bak "s|MOCK_CTF_ADDRESS=.*|MOCK_CTF_ADDRESS=$MOCK_CTF|g" ../../.env
sed -i.bak "s|COLLATERAL_ESCROW_ADDRESS=.*|COLLATERAL_ESCROW_ADDRESS=$ESCROW_ADDRESS|g" ../../.env
sed -i.bak "s|HORIZON_VAULT_ADDRESS=.*|HORIZON_VAULT_ADDRESS=$VAULT_ADDRESS|g" ../../.env
echo "✅ Updated .env"

# Update config.json
if [ -f "script/update-config.js" ]; then
    echo "Updating config.json..."
    node script/update-config.js "$ESCROW_ADDRESS" "$VAULT_ADDRESS"
else
    echo "⚠️  script/update-config.js not found, skipping config.json update"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Step 5/5: Deployment Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ All contracts deployed successfully!"
echo ""
echo "📋 Deployed Addresses:"
echo "   MockCTF:          $MOCK_CTF"
echo "   CollateralEscrow: $ESCROW_ADDRESS"
echo "   HorizonVault:     $VAULT_ADDRESS"
echo ""
echo "🔍 Block Explorer Links:"
echo "   Polygon Amoy:"
echo "   • MockCTF:    https://amoy.polygonscan.com/address/$MOCK_CTF"
echo "   • Escrow:     https://amoy.polygonscan.com/address/$ESCROW_ADDRESS"
echo "   Base Sepolia:"
echo "   • Vault:      https://sepolia.basescan.org/address/$VAULT_ADDRESS"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Setup user collateral (mint tokens & deposit):"
echo "   cd packages/contracts"
echo "   ./script/SetupUserCollateral.sh"
echo ""
echo "2️⃣  Run CRE workflow:"
echo "   cd apps/cre-workflow"
echo "   ./run-continuous.sh"
echo ""
echo "3️⃣  View dashboard:"
echo "   cd apps/dashboard"
echo "   npm run dev"
echo ""

# Save deployment info
cat > /tmp/vektar-deployment-info.txt <<EOF
Vektar Deployment Info
Generated: $(date)

Deployer: $DEPLOYER

Contracts:
- MockCTF:          $MOCK_CTF
- CollateralEscrow: $ESCROW_ADDRESS  
- HorizonVault:     $VAULT_ADDRESS

Explorer Links:
- MockCTF:    https://amoy.polygonscan.com/address/$MOCK_CTF
- Escrow:     https://amoy.polygonscan.com/address/$ESCROW_ADDRESS
- Vault:      https://sepolia.basescan.org/address/$VAULT_ADDRESS
EOF

echo "💾 Deployment info saved to: /tmp/vektar-deployment-info.txt"
echo ""
