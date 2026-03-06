#!/bin/bash
# setup-private-vault.sh — Guided setup for Convergence private vault operator
#
# What this does:
#   1. Generates a dedicated vault operator wallet (never reuse the deployer key)
#   2. Funds the operator from PRIVATE_KEY (minimal: 0.005 ETH + 1 LINK)
#   3. Deposits 1 LINK into the Convergence private vault
#   4. Updates secrets.yaml with VAULT_OPERATOR_KEY and VAULT_TOKEN
#
# Requires: PRIVATE_KEY in .env with Sepolia ETH + LINK
#
# After this script:
#   - Re-run test-handler3.sh → Handler 3 reaches Convergence API → real tx_id

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a && source .env && set +a
fi

CONVERGENCE_API="https://convergence2026-token-api.cldev.cloud"
PRIVATE_VAULT="0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13"
SEPOLIA_RPC="${SEPOLIA_RPC:-https://eth-sepolia.g.alchemy.com/v2/E_dlIDN3pFe5kVq7I-Jr-Y8jraQXzcaw}"

# Minimal amounts — one-time setup only
ETH_FOR_GAS="0.005"           # Enough for approve + deposit (2 txs)
LINK_AMOUNT="1000000000000000000"  # 1 LINK (18 decimals)

# LINK on Ethereum Sepolia — the only registered token in the Convergence demo vault.
VAULT_TOKEN="0x779877A7B0D9E8603169DdbD7836e478b4624789"

echo "════════════════════════════════════════════════════════════"
echo "🔐  Private Vault Operator Setup"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ -z "$PRIVATE_KEY" ]; then
  echo "  ✗ PRIVATE_KEY not set in .env"
  exit 1
fi

# ── Step 1: Generate vault operator wallet ───────────────────────────────────
echo "Step 1: Generate a dedicated vault operator wallet"
echo ""

WALLET_OUTPUT=$(cast wallet new 2>&1)
OPERATOR_KEY=$(echo "$WALLET_OUTPUT" | grep "Private key:" | awk '{print $3}')
OPERATOR_ADDR=$(echo "$WALLET_OUTPUT" | grep "Address:" | awk '{print $2}')

if [ -z "$OPERATOR_KEY" ] || [ -z "$OPERATOR_ADDR" ]; then
  echo "  ✗ cast wallet new failed. Output:"
  echo "$WALLET_OUTPUT"
  exit 1
fi

echo "  ✓ Operator address: $OPERATOR_ADDR"
echo ""

# ── Step 2: Fund operator from PRIVATE_KEY (minimal amounts) ─────────────────
echo "Step 2: Funding operator from PRIVATE_KEY (minimal one-time amounts)"
echo "  Sending: $ETH_FOR_GAS ETH (gas) + 1 LINK (vault deposit)"
echo ""

echo "  Sending $ETH_FOR_GAS ETH..."
cast send "$OPERATOR_ADDR" --value "${ETH_FOR_GAS}ether" \
  --rpc-url "$SEPOLIA_RPC" --private-key "$PRIVATE_KEY" || { echo "  ✗ ETH transfer failed. Ensure PRIVATE_KEY has Sepolia ETH."; exit 1; }
echo "  ✓ ETH sent"

echo "  Sending 1 LINK..."
cast send "$VAULT_TOKEN" "transfer(address,uint256)" "$OPERATOR_ADDR" "$LINK_AMOUNT" \
  --rpc-url "$SEPOLIA_RPC" --private-key "$PRIVATE_KEY" || { echo "  ✗ LINK transfer failed. Ensure PRIVATE_KEY has Sepolia LINK."; exit 1; }
echo "  ✓ LINK sent"
echo ""

# Brief pause for RPC to index
sleep 2

# ── Step 3: Approve + deposit into private vault ─────────────────────────────
echo "Step 3: Approve and deposit 1 LINK into Convergence private vault..."

echo "  Approving vault to spend 1 LINK..."
APPROVE_TX=$(cast send "$VAULT_TOKEN" \
  "approve(address,uint256)" \
  "$PRIVATE_VAULT" "$LINK_AMOUNT" \
  --rpc-url "$SEPOLIA_RPC" \
  --private-key "$OPERATOR_KEY" \
  --json 2>&1)

APPROVE_STATUS=$(echo "$APPROVE_TX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
if [ "$APPROVE_STATUS" = "0x1" ]; then
  echo "  ✓ Approved"
else
  echo "  ✗ Approval failed:"
  echo "$APPROVE_TX"
  echo "  Continuing — deposit may still work if allowance already set."
fi

echo "  Depositing 1 LINK into private vault..."
DEPOSIT_TX=$(cast send "$PRIVATE_VAULT" \
  "deposit(address,uint256)" \
  "$VAULT_TOKEN" "$LINK_AMOUNT" \
  --rpc-url "$SEPOLIA_RPC" \
  --private-key "$OPERATOR_KEY" \
  --json 2>&1)

DEPOSIT_STATUS=$(echo "$DEPOSIT_TX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
DEPOSIT_TX_HASH=$(echo "$DEPOSIT_TX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transactionHash',''))" 2>/dev/null)

if [ "$DEPOSIT_STATUS" = "0x1" ]; then
  echo "  ✓ Deposited. TX: $DEPOSIT_TX_HASH"
  echo "  ✓ Operator has private balance in the Convergence vault"
else
  echo "  ✗ Deposit failed:"
  echo "$DEPOSIT_TX"
  echo ""
  echo "  You may need to deposit via the API or dashboard:"
  echo "  $CONVERGENCE_API/docs"
  echo "  Continue anyway to write secrets (rerun after manual deposit)."
fi
echo ""

# ── Step 4: Update secrets.yaml ──────────────────────────────────────────────
echo "Step 4: Updating secrets.yaml..."

# Remove existing commented entries and add live ones
python3 -c "
import re, sys

with open('secrets.yaml', 'r') as f:
    content = f.read()

# Remove the commented-out vault secret blocks
content = re.sub(r'\n  # vaultOperatorKey:.*?\n  #   - VAULT_OPERATOR_KEY', '', content, flags=re.DOTALL)
content = re.sub(r'\n  # Handler 3:.*?- VAULT_TOKEN\n', '\n', content, flags=re.DOTALL)

# Append live entries at the end of secretsNames
vault_block = '''
  vaultOperatorKey:
    - VAULT_OPERATOR_KEY
  vaultToken:
    - VAULT_TOKEN
'''
content = content.rstrip() + '\n' + vault_block

with open('secrets.yaml', 'w') as f:
    f.write(content)
print('  ✓ secrets.yaml updated')
"

# Add env vars to .env
if ! grep -q "^VAULT_OPERATOR_KEY=" .env 2>/dev/null; then
  echo "" >> .env
  echo "# Convergence private vault operator (set by setup-private-vault.sh)" >> .env
  echo "VAULT_OPERATOR_KEY=$OPERATOR_KEY" >> .env
  echo "VAULT_TOKEN=$VAULT_TOKEN" >> .env
  echo "  ✓ VAULT_OPERATOR_KEY and VAULT_TOKEN written to .env"
else
  # Update existing
  sed -i '' "s|^VAULT_OPERATOR_KEY=.*|VAULT_OPERATOR_KEY=$OPERATOR_KEY|" .env
  sed -i '' "s|^VAULT_TOKEN=.*|VAULT_TOKEN=$VAULT_TOKEN|" .env
  echo "  ✓ VAULT_OPERATOR_KEY and VAULT_TOKEN updated in .env"
fi
echo ""

# ── Done ─────────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════"
echo "✅ Vault operator setup complete"
echo ""
echo "  Operator address: $OPERATOR_ADDR"
echo "  Vault token:      $VAULT_TOKEN"
echo ""
echo "  Next: simulate Handler 3 with real secrets"
echo ""
echo "  ./test-handler3.sh"
echo "  # → Handler 3 will reach Convergence API → real transaction_id"
echo "════════════════════════════════════════════════════════════"
