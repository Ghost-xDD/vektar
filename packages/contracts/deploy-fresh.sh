#!/bin/bash
# Complete fresh deployment: Everything from scratch for demo recording
# Deploys contracts, mints tokens, deposits collateral, opens position, updates configs
#
# IMPORTANT: This script validates every step before proceeding.

set -euo pipefail

cd "$(dirname "$0")"

# ============================================================
# HELPERS
# ============================================================

fail() {
  echo "" >&2
  echo "❌ FAILED at: $1" >&2
  echo "   $2" >&2
  exit 1
}

# Verify a contract exists on-chain (has code deployed)
verify_contract() {
  local addr=$1
  local chain_rpc=$2
  local label=$3

  # Wait a moment for block propagation
  sleep 3

  local code
  code=$(cast code "$addr" --rpc-url "$chain_rpc" 2>/dev/null || echo "0x")
  if [ "$code" = "0x" ] || [ -z "$code" ]; then
    # Retry once after longer wait
    echo "   ⏳ Waiting for block confirmation..." >&2
    sleep 10
    code=$(cast code "$addr" --rpc-url "$chain_rpc" 2>/dev/null || echo "0x")
    if [ "$code" = "0x" ] || [ -z "$code" ]; then
      fail "$label" "No code at $addr -- deployment did not land on-chain after 13s wait"
    fi
  fi
  echo "   ✓ Verified on-chain code for $label ($addr)" >&2
}

# Deploy a forge script and return the first created contract address.
# All log output goes to stderr so only the final address goes to stdout.
# Usage: ADDRESS=$(forge_deploy script/Foo.s.sol $RPC "label")
forge_deploy() {
  local script_path=$1
  local rpc_url=$2
  local label=$3

  # Clear stale broadcast files so we never read old data
  local chain_id
  chain_id=$(cast chain-id --rpc-url "$rpc_url" 2>/dev/null) || fail "$label" "Cannot reach RPC $rpc_url"
  local broadcast_dir="broadcast/$(basename "$script_path")/${chain_id}"
  rm -f "${broadcast_dir}/run-latest.json"

  echo "   Deploying $label..." >&2

  # Run forge script; capture all output to temp file for error checking
  local tmp_out
  tmp_out=$(mktemp)

  # Don't let set -e kill us here; we check errors manually
  set +e
  forge script "$script_path" \
    --rpc-url "$rpc_url" \
    --private-key "$PRIVATE_KEY" \
    --broadcast 2>&1 | tee "$tmp_out" >&2
  local pipe_status=${PIPESTATUS[0]}
  set -e

  # Check for known fatal errors in output
  if grep -q "insufficient funds" "$tmp_out"; then
    rm -f "$tmp_out"
    fail "$label" "Insufficient gas funds. Top up your wallet on chain $chain_id and retry."
  fi
  if grep -q "nonce too low" "$tmp_out"; then
    # Nonce desync -- wait and retry once
    echo "   ⚠️  Nonce desync detected, waiting 5s and retrying..." >&2
    rm -f "$tmp_out"
    sleep 5
    rm -f "${broadcast_dir}/run-latest.json"
    set +e
    forge script "$script_path" \
      --rpc-url "$rpc_url" \
      --private-key "$PRIVATE_KEY" \
      --broadcast 2>&1 | tee "$tmp_out" >&2
    pipe_status=${PIPESTATUS[0]}
    set -e
    if grep -q "insufficient funds\|Failed to send transaction" "$tmp_out"; then
      rm -f "$tmp_out"
      fail "$label" "Retry also failed. Check funds and RPC."
    fi
  fi
  rm -f "$tmp_out"

  # Extract address from the NEW broadcast file
  local broadcast_file="${broadcast_dir}/run-latest.json"
  if [ ! -f "$broadcast_file" ]; then
    fail "$label" "No broadcast file at $broadcast_file -- forge likely failed before simulation."
  fi

  local addr
  addr=$(jq -r '
    [.transactions[] | select(.contractAddress != null) | .contractAddress][0] // empty
  ' "$broadcast_file" 2>/dev/null)

  if [ -z "$addr" ]; then
    fail "$label" "No contract address in broadcast file. Simulation passed but broadcast failed."
  fi

  # Verify the contract actually has code on-chain
  verify_contract "$addr" "$rpc_url" "$label"

  # Return ONLY the address on stdout
  echo "$addr"
}

# Send a cast transaction and return the tx hash. Auto-retries on nonce errors.
# Usage: TX=$(cast_send_tx "label" $TO "sig" arg1 arg2 ... --rpc-url $RPC --private-key $KEY)
cast_send_tx() {
  local label=$1
  shift
  
  local result
  result=$(cast send "$@" --json 2>&1) || true

  local tx_hash
  tx_hash=$(echo "$result" | jq -r '.transactionHash // empty' 2>/dev/null)

  if [ -z "$tx_hash" ]; then
    # Check for nonce error and retry once
    if echo "$result" | grep -q "nonce too low"; then
      echo "   ⚠️  Nonce desync, waiting 5s and retrying..." >&2
      sleep 5
      result=$(cast send "$@" --json 2>&1) || true
      tx_hash=$(echo "$result" | jq -r '.transactionHash // empty' 2>/dev/null)
      
      if [ -z "$tx_hash" ]; then
        local err_msg
        err_msg=$(echo "$result" | grep -o '"message":"[^"]*"' | head -1 || echo "$result")
        fail "$label" "Transaction retry failed: $err_msg"
      fi
    else
      # Not a nonce issue, fail immediately
      local err_msg
      err_msg=$(echo "$result" | grep -o '"message":"[^"]*"' | head -1 || echo "$result")
      fail "$label" "Transaction failed: $err_msg"
    fi
  fi

  echo "$tx_hash"
}

# ============================================================
# MAIN
# ============================================================

echo "=========================================="
echo "🎬 VEKTAR - Fresh Demo Deployment"
echo "=========================================="
echo ""
echo "This will deploy EVERYTHING from scratch:"
echo "  1. Deploy MockCTF (Polygon Amoy)"
echo "  2. Deploy CollateralEscrow (Polygon Amoy)"
echo "  3. Deploy HorizonVault (Base Sepolia)"
echo "  4. Mint 20,000 CTF test tokens"
echo "  5. Approve + Deposit collateral to escrow"
echo "  6. Open borrowing position (\$5,000 USDC)"
echo "  7. Update all configs (CRE + Dashboard)"
echo ""
read -p "Ready to deploy fresh? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# --- Load .env ---
if [ ! -f ".env" ]; then
    fail "Load env" ".env file not found! Run: cp .env.example .env"
fi
echo ""
echo "📦 Loading environment variables..."
set -a; source .env; set +a

for var in PRIVATE_KEY BASE_SEPOLIA_RPC_URL POLYGON_AMOY_RPC_URL; do
  if [ -z "${!var:-}" ]; then
    fail "Env check" "$var is not set in .env"
  fi
done
echo "✅ Environment loaded"

USER_ADDRESS=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "🔑 Deployer: $USER_ADDRESS"

# --- Pre-flight balance checks ---
echo ""
echo "💰 Checking balances..."

POL_BALANCE=$(cast balance "$USER_ADDRESS" --rpc-url "$POLYGON_AMOY_RPC_URL" 2>/dev/null || echo "0")
POL_ETH=$(cast from-wei "$POL_BALANCE" 2>/dev/null || echo "0")
echo "   Polygon Amoy: $POL_ETH POL"

BASE_BALANCE=$(cast balance "$USER_ADDRESS" --rpc-url "$BASE_SEPOLIA_RPC_URL" 2>/dev/null || echo "0")
BASE_ETH=$(cast from-wei "$BASE_BALANCE" 2>/dev/null || echo "0")
echo "   Base Sepolia:  $BASE_ETH ETH"

# Need ~0.5 POL for Polygon (2 deploys + mint + approve + deposit)
# Need ~0.02 ETH for Base (deploy + openPosition)
POL_MIN="500000000000000000"  # 0.5 POL in wei
BASE_MIN="20000000000000000"  # 0.02 ETH in wei

if [ "$POL_BALANCE" = "0" ] || (( $(echo "$POL_BALANCE < $POL_MIN" | bc -l 2>/dev/null || echo "1") )); then
  fail "Balance check" "Need at least 0.5 POL (you have $POL_ETH). Get testnet POL: https://faucet.polygon.technology/"
fi
if [ "$BASE_BALANCE" = "0" ] || (( $(echo "$BASE_BALANCE < $BASE_MIN" | bc -l 2>/dev/null || echo "1") )); then
  fail "Balance check" "Need at least 0.02 ETH (you have $BASE_ETH). Get testnet ETH: https://www.alchemy.com/faucets/base-sepolia"
fi

echo "✅ Balances sufficient"
echo ""

# Constants
TOKEN_ID="56078938060096976448086754249497300447360333783952000147427828224794011030104"
AMOUNT="20000000000000000000000"  # 20,000 tokens (18 decimals)
DEBT_AMOUNT="5000000000"          # $5,000 USDC (6 decimals)

# ============================================================
# STEP 1: Deploy MockCTF on Polygon
# ============================================================
echo "=========================================="
echo "Step 1/8: Deploy MockCTF (Polygon)"
echo "=========================================="
MOCK_CTF_ADDRESS=$(forge_deploy script/DeployMockCTF.s.sol "$POLYGON_AMOY_RPC_URL" "MockCTF")
echo "✅ MockCTF: $MOCK_CTF_ADDRESS"
echo ""

# ============================================================
# STEP 2: Deploy CollateralEscrow on Polygon
# ============================================================
echo "=========================================="
echo "Step 2/8: Deploy CollateralEscrow (Polygon)"
echo "=========================================="
# Escrow must point to MockCTF (not real Polymarket) so depositCollateral works
export CTF_TOKEN_ADDRESS="$MOCK_CTF_ADDRESS"
ESCROW_ADDRESS=$(forge_deploy script/DeployPolygon.s.sol "$POLYGON_AMOY_RPC_URL" "CollateralEscrow")
echo "✅ Escrow: $ESCROW_ADDRESS"
echo ""

# ============================================================
# STEP 3: Deploy HorizonVault on Base (Demo Mode)
# ============================================================
echo "=========================================="
echo "Step 3/8: Deploy HorizonVault (Base)"
echo "=========================================="
export MAX_LTV_INCREASE_PER_UPDATE=10000
VAULT_ADDRESS=$(forge_deploy script/DeployBase.s.sol "$BASE_SEPOLIA_RPC_URL" "HorizonVault")
echo "✅ Vault: $VAULT_ADDRESS (demo mode: 10000 bps)"
echo ""

# ============================================================
# STEP 4: Mint CTF Tokens
# ============================================================
echo "=========================================="
echo "Step 4/8: Mint 20,000 CTF Tokens"
echo "=========================================="
echo "   Minting to $USER_ADDRESS..."

MINT_TX=$(cast_send_tx "Mint CTF tokens" \
  "$MOCK_CTF_ADDRESS" \
  "mint(address,uint256,uint256)" \
  "$USER_ADDRESS" "$TOKEN_ID" "$AMOUNT" \
  --rpc-url "$POLYGON_AMOY_RPC_URL" \
  --private-key "$PRIVATE_KEY")

echo "   TX: $MINT_TX"

# Verify balance
BALANCE_RAW=$(cast call "$MOCK_CTF_ADDRESS" \
  "balanceOf(address,uint256)(uint256)" \
  "$USER_ADDRESS" "$TOKEN_ID" \
  --rpc-url "$POLYGON_AMOY_RPC_URL")
BALANCE_DEC=$(echo "$BALANCE_RAW" | sed 's/ .*//')
echo "✅ Balance: $(echo "scale=0; $BALANCE_DEC / 1000000000000000000" | bc) tokens"
echo ""

# ============================================================
# STEP 5: Approve Escrow
# ============================================================
echo "=========================================="
echo "Step 5/8: Approve Escrow"
echo "=========================================="

APPROVE_TX=$(cast_send_tx "Approve escrow" \
  "$MOCK_CTF_ADDRESS" \
  "setApprovalForAll(address,bool)" \
  "$ESCROW_ADDRESS" true \
  --rpc-url "$POLYGON_AMOY_RPC_URL" \
  --private-key "$PRIVATE_KEY")

echo "✅ Approved | TX: $APPROVE_TX"
echo ""

# ============================================================
# STEP 6: Deposit Collateral
# ============================================================
echo "=========================================="
echo "Step 6/8: Deposit Collateral"
echo "=========================================="

DEPOSIT_TX=$(cast_send_tx "Deposit collateral" \
  "$ESCROW_ADDRESS" \
  "depositCollateral(uint256,uint256)" \
  "$TOKEN_ID" "$AMOUNT" \
  --rpc-url "$POLYGON_AMOY_RPC_URL" \
  --private-key "$PRIVATE_KEY")

echo "   TX: $DEPOSIT_TX"

# Verify locked balance
LOCKED_RAW=$(cast call "$ESCROW_ADDRESS" \
  "getLockedBalance(address,uint256)(uint256)" \
  "$USER_ADDRESS" "$TOKEN_ID" \
  --rpc-url "$POLYGON_AMOY_RPC_URL")
LOCKED_DEC=$(echo "$LOCKED_RAW" | sed 's/ .*//')
echo "✅ Locked: $(echo "scale=0; $LOCKED_DEC / 1000000000000000000" | bc) tokens in escrow"
echo ""

# ============================================================
# STEP 7: Open Borrowing Position
# ============================================================
echo "=========================================="
echo "Step 7/8: Open Borrowing Position"
echo "=========================================="

BORROW_TX=$(cast_send_tx "Open position" \
  "$VAULT_ADDRESS" \
  "openPosition(address,uint256,uint256,uint256,address)" \
  "$USER_ADDRESS" "$TOKEN_ID" "$AMOUNT" "$DEBT_AMOUNT" "$USER_ADDRESS" \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY")

echo "✅ Position opened | TX: $BORROW_TX"
echo "   Collateral: 20,000 shares"
echo "   Debt: \$5,000 USDC"
echo ""

# ============================================================
# STEP 8: Save Deployment + Update Configs
# ============================================================
echo "=========================================="
echo "Step 8/8: Save & Update Configs"
echo "=========================================="

cat > .latest-deployment.json << DEPLOY_EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployer": "$USER_ADDRESS",
  "polygon": {
    "network": "amoy",
    "mockCTFAddress": "$MOCK_CTF_ADDRESS",
    "escrowAddress": "$ESCROW_ADDRESS"
  },
  "base": {
    "network": "sepolia",
    "vaultAddress": "$VAULT_ADDRESS",
    "maxLtvIncrease": 10000
  },
  "market": {
    "tokenId": "$TOKEN_ID",
    "collateralAmount": "$AMOUNT",
    "debtAmount": "$DEBT_AMOUNT"
  }
}
DEPLOY_EOF

echo "✅ Saved .latest-deployment.json"

# Update configs
./update-config.sh

echo ""
echo "=========================================="
echo "🎉 FRESH DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   MockCTF:    $MOCK_CTF_ADDRESS"
echo "   Escrow:     $ESCROW_ADDRESS"
echo "   Vault:      $VAULT_ADDRESS"
echo "   User:       $USER_ADDRESS"
echo "   Collateral: 20,000 tokens"
echo "   Debt:       \$5,000 USDC"
echo ""
echo "🔗 Explorers:"
echo "   Polygon: https://amoy.polygonscan.com/address/$ESCROW_ADDRESS"
echo "   Base:    https://sepolia.basescan.org/address/$VAULT_ADDRESS"
echo ""
echo "🎬 Next Steps:"
echo "  1. cd ../../apps/cre-workflow && ./run-continuous.sh normal"
echo "  2. cd ../../apps/dashboard && npm run dev"
echo ""
