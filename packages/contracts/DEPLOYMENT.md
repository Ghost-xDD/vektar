# Vektar Deployment Guide

## Prerequisites

1. **Install Foundry** (if not already installed):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. **Install Dependencies**:

```bash
cd packages/contracts
forge install
```

3. **Setup Environment**:

```bash
# Copy template to .env
cp ../../env.template ../../.env

# Edit .env and fill in:
# - PRIVATE_KEY (your testnet wallet private key)
# - POLYGON_TESTNET_RPC_URL (recommend Alchemy)
# - BASE_RPC_URL (recommend Alchemy)
# - POLYGONSCAN_API_KEY (for verification)
# - BASESCAN_API_KEY (for verification)
```

4. **Get Testnet Tokens**:

- **Polygon Amoy**: https://faucet.polygon.technology/
- **Base Sepolia**: https://www.alchemy.com/faucets/base-sepolia

---

## Deployment Steps

### Option 1: Deploy All Contracts (Recommended)

```bash
cd packages/contracts
chmod +x script/DeployAll.sh
./script/DeployAll.sh
```

This will:

1. Deploy `CollateralEscrow` to Polygon Amoy
2. Deploy `HorizonVault` to Base Sepolia
3. Attempt to verify both contracts on block explorers
4. Print deployment addresses

### Option 2: Deploy Individually

**Deploy to Polygon Amoy:**

```bash
forge script script/DeployPolygon.s.sol \
  --rpc-url $POLYGON_TESTNET_RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

**Deploy to Base Sepolia:**

```bash
forge script script/DeployBase.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

---

## Post-Deployment Configuration

### 1. Update Config Files

**Automatic (Recommended):**

```bash
# Run from packages/contracts
node script/update-config.js <ESCROW_ADDRESS> <VAULT_ADDRESS>
```

**Manual:**
Edit `apps/cre-workflow/vektar-engine/config.json`:

```json
{
  "polygon": {
    "escrowAddress": "<DEPLOYED_ESCROW_ADDRESS>"
  },
  "base": {
    "vaultAddress": "<DEPLOYED_VAULT_ADDRESS>"
  }
}
```

Edit `vekta/.env`:

```bash
COLLATERAL_ESCROW_ADDRESS=<DEPLOYED_ESCROW_ADDRESS>
HORIZON_VAULT_ADDRESS=<DEPLOYED_VAULT_ADDRESS>
```

### 2. Configure CRE Forwarder (After Workflow Deployment)

The contracts are initially deployed with the deployer address as a placeholder for the CRE forwarder. After deploying your CRE workflow, you'll need to:

1. Get the CRE forwarder address from your workflow deployment
2. Add to `.env`: `CRE_FORWARDER_ADDRESS=<YOUR_CRE_FORWARDER>`
3. Redeploy contracts with the actual forwarder address

**Or** use a multisig/admin function to update the forwarder address (TODO: add this to contracts).

### 3. Add Test Data to Config

Edit `apps/cre-workflow/vektar-engine/config.json`:

```json
{
  "watchedUsers": ["0xYourTestUserAddress1", "0xYourTestUserAddress2"],
  "assertionToTokenMap": {
    "0xSomeAssertionId": "21742633143463906290569050155826241533067272736897614950488156847949938836455"
  }
}
```

---

## Verification (If Auto-Verify Failed)

**Polygon Amoy:**

```bash
forge verify-contract <ESCROW_ADDRESS> \
  CollateralEscrow \
  --chain polygon-amoy \
  --constructor-args $(cast abi-encode "constructor(address,address)" <CTF_EXCHANGE> <CRE_FORWARDER>)
```

**Base Sepolia:**

```bash
forge verify-contract <VAULT_ADDRESS> \
  HorizonVault \
  --chain base-sepolia \
  --constructor-args $(cast abi-encode "constructor(address)" <CRE_FORWARDER>)
```

---

## Testing the Deployment

### 1. Test CRE Workflow Simulation

```bash
cd apps/cre-workflow
cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 0 \
  --target local-simulation
```

Expected output:

- ✅ Order book fetch from Polymarket
- ✅ Collateral read from Polygon
- ✅ LTV calculation
- ⚠️ Write will fail if you haven't set up --broadcast mode yet

### 2. Test with Broadcast (Actual Transactions)

```bash
# Make sure CRE_ETH_PRIVATE_KEY is set in .env
cre workflow simulate vektar-engine \
  --target local-simulation \
  --broadcast
```

This will write actual transactions to both chains!

### 3. Verify on Block Explorers

- **Polygon Amoy**: https://amoy.polygonscan.com/address/<ESCROW_ADDRESS>
- **Base Sepolia**: https://sepolia.basescan.org/address/<VAULT_ADDRESS>

Look for:

- `MarketLTVUpdated` events on Base
- Transaction from CRE forwarder address

---

## Troubleshooting

### "Insufficient funds" error

- Get more testnet tokens from faucets
- Each deployment costs ~$0.10-0.50 in testnet gas

### "Invalid nonce" error

- Wait a few seconds and retry
- Your RPC provider may be slow to update nonce

### "Verification failed" error

- Verify manually using the commands above
- Make sure API keys are set in .env
- Sometimes etherscan is slow - wait and retry

### "CRE forwarder" issues

- For initial testing, deployer address is used
- Update after CRE workflow is deployed
- Contracts won't accept updates from other addresses

---

## Next Steps After Successful Deployment

1. ✅ Contracts deployed and verified
2. ✅ Config files updated
3. ⬜ Find real UMA `AssertionSettled` event on Amoy
4. ⬜ Add real test users with open positions
5. ⬜ Test end-to-end with `--broadcast`
6. ⬜ Build frontend dashboard
7. ⬜ Record demo video

---

## Quick Reference: Important Addresses

### Polygon Amoy

- CTF Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- UMA Oracle: `0xd8866E76441df243fc98B892362Fc6264dC3ca80`
- Your Escrow: `<DEPLOYED_ADDRESS>`

### Base Sepolia

- Your Vault: `<DEPLOYED_ADDRESS>`

### Faucets

- Polygon: https://faucet.polygon.technology/
- Base: https://www.alchemy.com/faucets/base-sepolia
- Chainlink: https://faucets.chain.link/
