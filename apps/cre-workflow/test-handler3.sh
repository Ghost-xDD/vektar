#!/bin/bash
# test-handler3.sh — End-to-end test for Handler 3 (private payout)
#
# Flow:
#   1. Run Handler 1 (normal) → sets per-share oracle value on Base
#   2. Verify oracle value is non-zero
#   3. Call earlyExit(tokenId) → pays demo user, emits EarlyExitExecuted
#   4. Parse receipt → find EarlyExitExecuted log index
#   5. Print ready-to-run cre simulate command for Handler 3
#
# Expected outcome without secrets:
#   Handler 3 runs, reads shielded address (0x000 → graceful skip log).
#   To reach the Convergence API call: run ./setup-private-vault.sh first.

set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a && source .env && set +a
fi

VAULT="$SETTLEMENT_VAULT_ADDRESS"
TOKEN_ID="56078938060096976448086754249497300447360333783952000147427828224794011030104"
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USER="0x311e26702ABa231c321C633d1ff6ecB4445f2308"

echo "════════════════════════════════════════════════"
echo "🔬  Handler 3 — earlyExit() → simulate test"
echo "════════════════════════════════════════════════"
echo "  vault:  $VAULT"
echo "  user:   $USER"
echo ""

# ── Step 1: Run Handler 1 to set oracle value ────────────────────────────────
echo "Step 1: Setting oracle value via Handler 1 (normal run)..."
./run-normal.sh 2>&1 | grep -E "^\[COMPUTE\]|^\[TX\]|✅" || true
echo ""

# ── Step 2: Verify oracle value is set ───────────────────────────────────────
echo "Step 2: Verifying oracle value on-chain..."
ORACLE_RAW=$(cast call "$VAULT" \
  "getSettlementValue(uint256)(uint256,uint256)" \
  "$TOKEN_ID" \
  --rpc-url "$BASE_TENDERLY_RPC" 2>&1)

ORACLE_VALUE=$(echo "$ORACLE_RAW" | head -1 | tr -d '[:space:]')

if [ -z "$ORACLE_VALUE" ] || [ "$ORACLE_VALUE" = "0" ]; then
  echo "  ✗ Oracle value is 0 — Handler 1 may have failed. Check run-normal.sh output."
  exit 1
fi

ORACLE_DOLLARS=$(python3 -c "print(f'\${int(\"$ORACLE_VALUE\") / 1_000_000:.6f}/share')" 2>/dev/null || echo "$ORACLE_VALUE raw")
echo "  ✓ Per-share oracle price: $ORACLE_DOLLARS"

# Expected payout for 20,000 shares
EXPECTED_PAYOUT=$(python3 -c "print(f'\${int(\"$ORACLE_VALUE\") * 20000 / 1_000_000:,.2f} USDC')" 2>/dev/null || echo "unknown")
echo "  ✓ Expected payout for 20,000 shares: $EXPECTED_PAYOUT"
echo ""

# ── Step 3: Check USDC vault balance ─────────────────────────────────────────
echo "Step 3: Checking vault USDC balance..."
VAULT_BAL=$(cast call "$USDC" \
  "balanceOf(address)(uint256)" \
  "$VAULT" \
  --rpc-url "$BASE_TENDERLY_RPC" 2>&1 | head -1 | tr -d '[:space:]')

VAULT_BAL_USD=$(python3 -c "print(f'\${int(\"$VAULT_BAL\") / 1_000_000:,.2f}')" 2>/dev/null || echo "$VAULT_BAL raw")
echo "  ✓ Vault balance: $VAULT_BAL_USD USDC"

PAYOUT_RAW=$(python3 -c "print(int(\"$ORACLE_VALUE\") * 20000)" 2>/dev/null || echo "0")
if python3 -c "exit(0 if int('$VAULT_BAL') >= int('$PAYOUT_RAW') else 1)" 2>/dev/null; then
  echo "  ✓ Sufficient balance for payout"
else
  echo "  ✗ Insufficient vault balance. Re-funding with 50k USDC..."
  curl -s -X POST "$BASE_TENDERLY_ADMIN_RPC" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"tenderly_setErc20Balance\",\"params\":[\"$USDC\",\"$VAULT\",\"0xBA43B7400\"],\"id\":1}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('  ✓ Funded' if 'result' in r else f'  ✗ {r}')"
fi
echo ""

# ── Step 4: Check position is not already settled ────────────────────────────
echo "Step 4: Checking position state..."
POS_RAW=$(cast call "$VAULT" \
  "positions(address,uint256)(uint256,uint256,uint256,bool,address,address)" \
  "$USER" "$TOKEN_ID" \
  --rpc-url "$BASE_TENDERLY_RPC" 2>&1)

SHARES=$(echo "$POS_RAW" | sed -n '2p' | tr -d '[:space:]')
SETTLED=$(echo "$POS_RAW" | sed -n '4p' | tr -d '[:space:]')

if [ "$SETTLED" = "true" ]; then
  echo "  ✗ Position already settled. The demo user already called earlyExit()."
  echo "    To reset: re-register the position with a fresh user or redeploy the vault."
  exit 1
fi

echo "  ✓ shares: $SHARES  settled: $SETTLED"
echo ""

# ── Step 5: Call earlyExit() ─────────────────────────────────────────────────
echo "Step 5: Calling earlyExit()..."
EXIT_TX=$(cast send "$VAULT" \
  "earlyExit(uint256)" "$TOKEN_ID" \
  --rpc-url "$BASE_TENDERLY_RPC" \
  --private-key "$PRIVATE_KEY" \
  --gas-limit 300000 \
  --json 2>&1)

TX_HASH=$(echo "$EXIT_TX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transactionHash',''))" 2>/dev/null)
TX_STATUS=$(echo "$EXIT_TX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)

if [ -z "$TX_HASH" ] || [ "$TX_STATUS" != "0x1" ]; then
  echo "  ✗ earlyExit() failed. Raw output:"
  echo "$EXIT_TX"
  exit 1
fi

echo "  ✓ TX: $TX_HASH"
echo "  ✓ Status: success"
echo ""

# ── Step 6: Parse receipt for EarlyExitExecuted log index ────────────────────
echo "Step 6: Parsing receipt for EarlyExitExecuted log index..."

EARLY_EXIT_TOPIC=$(cast keccak "EarlyExitExecuted(address,uint256,uint256)" 2>/dev/null)

RECEIPT=$(cast receipt "$TX_HASH" \
  --rpc-url "$BASE_TENDERLY_RPC" \
  --json 2>&1)

LOG_INDEX=$(echo "$RECEIPT" | python3 -c "
import sys, json
receipt = json.load(sys.stdin)
topic = '$EARLY_EXIT_TOPIC'
for i, log in enumerate(receipt.get('logs', [])):
    topics = log.get('topics', [])
    if topics and topics[0].lower() == topic.lower():
        print(i)
        sys.exit(0)
print(1)  # fallback: USDC Transfer is log 0, EarlyExitExecuted is log 1
" 2>/dev/null || echo "1")

# Also decode the payout from the receipt
PAYOUT_HEX=$(echo "$RECEIPT" | python3 -c "
import sys, json
receipt = json.load(sys.stdin)
topic = '$EARLY_EXIT_TOPIC'
for log in receipt.get('logs', []):
    topics = log.get('topics', [])
    if topics and topics[0].lower() == topic.lower():
        data = log.get('data', '0x')
        val = int(data, 16)
        print(f'\${val / 1_000_000:,.2f} USDC ({val} raw)')
        sys.exit(0)
print('unknown')
" 2>/dev/null || echo "unknown")

echo "  ✓ EarlyExitExecuted at log index: $LOG_INDEX"
echo "  ✓ Payout: $PAYOUT_HEX"
echo ""

# ── Done ─────────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════"
echo "✅ earlyExit() confirmed. Simulate Handler 3:"
echo ""
echo "  cd $(pwd)"
echo "  cre workflow simulate vektar-engine \\"
echo "    --non-interactive \\"
echo "    --trigger-index 2 \\"
echo "    --evm-tx-hash $TX_HASH \\"
echo "    --evm-event-index $LOG_INDEX \\"
echo "    --target local-simulation"
echo ""
echo "  With no VAULT_OPERATOR_KEY in secrets.yaml:"
echo "    → Handler 3 reads shielded address (0x000 → skip log, clean exit)"
echo "  After ./setup-private-vault.sh:"
echo "    → Full private transfer, Convergence returns transaction_id"
echo "════════════════════════════════════════════════"
