#!/bin/bash
# Update all configs (CRE workflow, dashboard, and .env) with deployed contract addresses

set -e

cd "$(dirname "$0")"

if [ ! -f ".latest-deployment.json" ]; then
    echo "❌ No deployment found. Run ./deploy-demo.sh first."
    exit 1
fi

ESCROW_ADDRESS=$(jq -r '.polygon.escrowAddress // empty' .latest-deployment.json)
VAULT_ADDRESS=$(jq -r '.base.vaultAddress // empty' .latest-deployment.json)
MOCK_CTF_ADDRESS=$(jq -r '.polygon.mockCTFAddress // empty' .latest-deployment.json)
DEPLOYER_ADDRESS=$(jq -r '.deployer // empty' .latest-deployment.json)

if [ -z "$ESCROW_ADDRESS" ] || [ -z "$VAULT_ADDRESS" ] || [ -z "$DEPLOYER_ADDRESS" ]; then
  echo "❌ Deployment JSON missing required fields"
  exit 1
fi

echo "=========================================="
echo "📝 Updating All Configurations"
echo "=========================================="
echo ""
echo "Escrow:  $ESCROW_ADDRESS"
echo "Vault:   $VAULT_ADDRESS"
echo "MockCTF: $MOCK_CTF_ADDRESS"
echo "Deployer: $DEPLOYER_ADDRESS"
echo ""

# ============================================================================
# 1. Update CRE Workflow config.json
# ============================================================================
CONFIG_PATH="../../apps/cre-workflow/vektar-engine/config.json"

if [ ! -f "$CONFIG_PATH" ]; then
    echo "❌ CRE config not found at: $CONFIG_PATH"
    exit 1
fi

echo "1️⃣  Updating CRE Workflow config.json..."
cp "$CONFIG_PATH" "$CONFIG_PATH.backup"

jq \
  --arg escrow "$ESCROW_ADDRESS" \
  --arg vault "$VAULT_ADDRESS" \
  '.polygon.escrowAddress = $escrow | .base.vaultAddress = $vault' \
  "$CONFIG_PATH" > "$CONFIG_PATH.tmp"

mv "$CONFIG_PATH.tmp" "$CONFIG_PATH"
echo "✅ Updated apps/cre-workflow/vektar-engine/config.json"

# ============================================================================
# 2. Update CRE Workflow .env (resolve symlinks first)
# ============================================================================
CRE_ENV_PATH="../../apps/cre-workflow/.env"

if [ -f "$CRE_ENV_PATH" ] || [ -L "$CRE_ENV_PATH" ]; then
    echo ""
    echo "2️⃣  Updating CRE Workflow .env..."
    
    # Resolve symlink if needed
    if [ -L "$CRE_ENV_PATH" ]; then
        REAL_ENV_PATH=$(readlink "$CRE_ENV_PATH")
        # If relative path, resolve from CRE directory
        if [[ "$REAL_ENV_PATH" != /* ]]; then
            REAL_ENV_PATH="../../apps/cre-workflow/$REAL_ENV_PATH"
        fi
        CRE_ENV_PATH="$REAL_ENV_PATH"
    fi
    
    cp "$CRE_ENV_PATH" "$CRE_ENV_PATH.backup"
    
    # Use sed without -i for symlinks
    sed "s|^COLLATERAL_ESCROW_ADDRESS=.*|COLLATERAL_ESCROW_ADDRESS=$ESCROW_ADDRESS|" "$CRE_ENV_PATH" > "$CRE_ENV_PATH.tmp"
    # Update both current and legacy Base vault env keys for compatibility.
    sed "s|^SETTLEMENT_VAULT_ADDRESS=.*|SETTLEMENT_VAULT_ADDRESS=$VAULT_ADDRESS|" "$CRE_ENV_PATH.tmp" > "$CRE_ENV_PATH.tmp2"
    sed "s|^HORIZON_VAULT_ADDRESS=.*|HORIZON_VAULT_ADDRESS=$VAULT_ADDRESS|" "$CRE_ENV_PATH.tmp2" > "$CRE_ENV_PATH.tmp3"
    mv "$CRE_ENV_PATH.tmp3" "$CRE_ENV_PATH"
    rm -f "$CRE_ENV_PATH.tmp" "$CRE_ENV_PATH.tmp2"
    
    echo "✅ Updated apps/cre-workflow/.env"
else
    echo "⚠️  CRE .env not found (optional)"
fi

# ============================================================================
# 3. Update Dashboard .env.local (resolve symlinks)
# ============================================================================
DASHBOARD_ENV_PATH="../../apps/dashboard/.env.local"

if [ -f "$DASHBOARD_ENV_PATH" ] || [ -L "$DASHBOARD_ENV_PATH" ]; then
    echo ""
    echo "3️⃣  Updating Dashboard .env.local..."
    
    # Resolve symlink if needed
    if [ -L "$DASHBOARD_ENV_PATH" ]; then
        REAL_ENV_PATH=$(readlink "$DASHBOARD_ENV_PATH")
        if [[ "$REAL_ENV_PATH" != /* ]]; then
            REAL_ENV_PATH="../../apps/dashboard/$REAL_ENV_PATH"
        fi
        DASHBOARD_ENV_PATH="$REAL_ENV_PATH"
    fi
    
    cp "$DASHBOARD_ENV_PATH" "$DASHBOARD_ENV_PATH.backup"
    
    # Use sed without -i for symlinks
    sed "s|^VITE_SETTLEMENT_VAULT_ADDRESS=.*|VITE_SETTLEMENT_VAULT_ADDRESS=$VAULT_ADDRESS|" "$DASHBOARD_ENV_PATH" > "$DASHBOARD_ENV_PATH.tmp"
    sed "s|^VITE_VAULT_ADDRESS=.*|VITE_VAULT_ADDRESS=$VAULT_ADDRESS|" "$DASHBOARD_ENV_PATH.tmp" > "$DASHBOARD_ENV_PATH.tmp2"
    sed "s|^VITE_ESCROW_ADDRESS=.*|VITE_ESCROW_ADDRESS=$ESCROW_ADDRESS|" "$DASHBOARD_ENV_PATH.tmp2" > "$DASHBOARD_ENV_PATH.tmp3"
    sed "s|^VITE_USER_ADDRESS=.*|VITE_USER_ADDRESS=$DEPLOYER_ADDRESS|" "$DASHBOARD_ENV_PATH.tmp3" > "$DASHBOARD_ENV_PATH.tmp4"
    mv "$DASHBOARD_ENV_PATH.tmp4" "$DASHBOARD_ENV_PATH"
    rm -f "$DASHBOARD_ENV_PATH.tmp" "$DASHBOARD_ENV_PATH.tmp2" "$DASHBOARD_ENV_PATH.tmp3"
    
    echo "✅ Updated apps/dashboard/.env.local"
else
    echo "⚠️  Dashboard .env.local not found"
    echo "Creating new one..."
    
    cat > "$DASHBOARD_ENV_PATH" <<EOF
# RPC URLs
VITE_BASE_RPC_URL=https://base-sepolia.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY_BASE
VITE_POLYGON_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY_POLYGON

# Contract addresses (auto-updated from deployment)
VITE_SETTLEMENT_VAULT_ADDRESS=$VAULT_ADDRESS
VITE_ESCROW_ADDRESS=$ESCROW_ADDRESS

# Market config
VITE_TOKEN_ID=56078938060096976448086754249497300447360333783952000147427828224794011030104
VITE_NO_TOKEN_ID=11291662904897713174667903388388696640643610556195928998276904135282270136756
VITE_USER_ADDRESS=$DEPLOYER_ADDRESS
EOF
    
    echo "✅ Created apps/dashboard/.env.local"
fi

echo ""
echo "=========================================="
echo "✅ All Configurations Updated!"
echo "=========================================="
echo ""
echo "📋 Summary:"
echo "  ✓ CRE config.json (escrow + vault addresses)"
echo "  ✓ CRE .env (contract addresses)"
echo "  ✓ Dashboard .env.local (frontend variables)"
echo ""
echo "💾 Backups created:"
echo "  - config.json.backup"
echo "  - .env.backup (if existed)"
echo "  - .env.local.backup (if existed)"
echo ""
echo "📝 Next steps:"
echo "  1. Test CRE: cd ../../apps/cre-workflow && ./run-normal.sh"
echo "  2. Start dashboard: cd ../../apps/dashboard && bun dev"
echo ""
