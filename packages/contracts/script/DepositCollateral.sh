#!/bin/bash
# Helper script to deposit mock collateral for testing

set -e

echo "=========================================="
echo "Depositing Mock Collateral to Test CRE"
echo "=========================================="
echo ""

# Load env
export $(grep -v '^#' ../../.env | xargs)

ESCROW="0x194E19AF9bfe69aDA8de9df3eAfAebbe60d0bC74"
TOKEN_ID="21742633143463906290569050155826241533067272736897614950488156847949938836455"
AMOUNT="1000000000000000000" # 1 token

echo "Note: This requires CTF tokens. For testing without real tokens,"
echo "we can modify the escrow contract to accept mock deposits."
echo ""
echo "For now, let's test CRE workflow without collateral requirement..."
echo ""
echo "Alternative: Comment out the collateral check in monitor-liquidity.ts"
echo "Lines 58-61 to test LTV updates without collateral."
echo ""
