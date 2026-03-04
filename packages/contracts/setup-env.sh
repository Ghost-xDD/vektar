#!/bin/bash
# Helper script to set up environment variables for deployment
# Run with: source ./setup-env.sh

echo "=========================================="
echo "🔧 Environment Setup for Deployment"
echo "=========================================="
echo ""

# Check if being sourced (required for exports to persist)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "⚠️  This script must be sourced to export variables!"
    echo ""
    echo "Run with:"
    echo "  source ./setup-env.sh"
    echo "  OR"
    echo "  . ./setup-env.sh"
    echo ""
    exit 1
fi

# ============================================================================
# Private Key
# ============================================================================
if [ -z "$PRIVATE_KEY" ]; then
    echo "Enter your PRIVATE_KEY (will not be echoed):"
    read -s PRIVATE_KEY
    export PRIVATE_KEY
    echo "✅ PRIVATE_KEY set"
else
    echo "✅ PRIVATE_KEY already set"
fi

# ============================================================================
# RPC URLs
# ============================================================================
if [ -z "$BASE_SEPOLIA_RPC_URL" ]; then
    echo ""
    echo "Enter BASE_SEPOLIA_RPC_URL:"
    echo "(e.g., https://base-sepolia.g.alchemy.com/v2/YOUR_KEY)"
    read BASE_SEPOLIA_RPC_URL
    export BASE_SEPOLIA_RPC_URL
    echo "✅ BASE_SEPOLIA_RPC_URL set"
else
    echo "✅ BASE_SEPOLIA_RPC_URL already set"
fi

if [ -z "$POLYGON_AMOY_RPC_URL" ]; then
    echo ""
    echo "Enter POLYGON_AMOY_RPC_URL:"
    echo "(e.g., https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY)"
    read POLYGON_AMOY_RPC_URL
    export POLYGON_AMOY_RPC_URL
    echo "✅ POLYGON_AMOY_RPC_URL set"
else
    echo "✅ POLYGON_AMOY_RPC_URL already set"
fi

# ============================================================================
# Optional: API Keys for verification
# ============================================================================
if [ -z "$BASESCAN_API_KEY" ]; then
    echo ""
    echo "Enter BASESCAN_API_KEY (optional, press Enter to skip):"
    read BASESCAN_API_KEY
    if [ -n "$BASESCAN_API_KEY" ]; then
        export BASESCAN_API_KEY
        echo "✅ BASESCAN_API_KEY set"
    else
        echo "⏭️  Skipped BASESCAN_API_KEY"
    fi
else
    echo "✅ BASESCAN_API_KEY already set"
fi

if [ -z "$POLYGONSCAN_API_KEY" ]; then
    echo ""
    echo "Enter POLYGONSCAN_API_KEY (optional, press Enter to skip):"
    read POLYGONSCAN_API_KEY
    if [ -n "$POLYGONSCAN_API_KEY" ]; then
        export POLYGONSCAN_API_KEY
        echo "✅ POLYGONSCAN_API_KEY set"
    else
        echo "⏭️  Skipped POLYGONSCAN_API_KEY"
    fi
else
    echo "✅ POLYGONSCAN_API_KEY already set"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "=========================================="
echo "✅ Environment Setup Complete!"
echo "=========================================="
echo ""
echo "📋 Environment variables set:"
echo "  ✓ PRIVATE_KEY"
echo "  ✓ BASE_SEPOLIA_RPC_URL"
echo "  ✓ POLYGON_AMOY_RPC_URL"
[ -n "$BASESCAN_API_KEY" ] && echo "  ✓ BASESCAN_API_KEY"
[ -n "$POLYGONSCAN_API_KEY" ] && echo "  ✓ POLYGONSCAN_API_KEY"
echo ""
echo "📝 Ready to deploy!"
echo "  ./deploy-demo.sh       (for video demos)"
echo "  ./deploy-production.sh (for production)"
echo ""
echo "💡 Tip: To persist these across terminal sessions,"
echo "    add them to your ~/.bashrc or ~/.zshrc"
echo ""
