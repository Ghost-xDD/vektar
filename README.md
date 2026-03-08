# Vektar

[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE-375BD2?logo=chainlink&logoColor=white)](https://docs.chain.link/cre)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-FBF0DF?logo=bun&logoColor=black)](https://bun.sh)
[![Solidity](https://img.shields.io/badge/Solidity-0.8-363636?logo=solidity&logoColor=white)](https://soliditylang.org/)
[![Polygon](https://img.shields.io/badge/Polygon-mainnet_fork-7B3FE4?logo=polygon&logoColor=white)](https://polygon.technology/)
[![Base](https://img.shields.io/badge/Base-mainnet_fork-0052FF?logo=coinbase&logoColor=white)](https://base.org/)
[![Hackathon](https://img.shields.io/badge/Chainlink-Convergence_2026-375BD2)](https://chain.link/)

**The settlement oracle for prediction markets.**

```
getPrice("ETH/USD")         → $3,241   ✓  (Chainlink)
isMarketResolved(id)        → true     ✓  (UMA)
getSettlementValue(tokenId) → ???      ✗  (nobody)  ← Vektar builds this
```

$20B+ sits in prediction markets. Protocols want to build on top — lending, leverage, options. Users want to exit before binary resolution. Both hit the same wall: **there is no on-chain source for what a prediction market position can actually be settled for.** Not what it's priced at. What it clears for, right now, against real order book depth.

Every 12 seconds, a CRE workflow fetches the live Polymarket order book via Confidential HTTP with BFT consensus, simulates real exit cost via VWAP, and publishes a cryptographically-signed settlement value on-chain. The fetch is TEE-shielded — no DON node sees which market is being priced. Any protocol calls `getSettlementValue(tokenId)` — a public oracle, like Chainlink price feeds but for prediction market exit liquidity.

**To prove the oracle works, we built a demo app on top of it: early exit.** Users call `earlyExit()` and receive the oracle's settlement value in USDC immediately, with payouts routed through a Convergence privacy vault — recipient, amount, and operator identity never appear on-chain. 

The oracle is the product. Early exit is one thing you can build with it.

---

## Contents

- [The Problem](#the-problem)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Why Tenderly Virtual TestNets](#why-tenderly-virtual-testnets)
- [Privacy](#privacy)
- [Why CRE](#why-cre)
- [What This Enables](#what-this-enables)
- [Files Using Chainlink CRE](#files-using-chainlink-cre)
- [Comparison](#comparison)
- [End-to-End Demo Flow](#end-to-end-demo-flow)
- [Challenges](#challenges)
- [Quick Start](#quick-start)
- [Repo](#repo)

---

## The Problem

A user holds $10k of "Yes" shares. The order book has $2k of buy-side depth. Their real exit value is **$2,700** — but every price oracle reports **$7,500**. Lend against price, and the loan is insolvent before it settles.

This is the **liquidity illusion**: prediction market price has no relationship to prediction market exit value. Three consequences:

**No safe collateral signal.** DeFi protocols can't use prediction market positions as collateral because no oracle reports what they're actually worth. Price says $7,500. The market can absorb $2,700. The difference is bad debt.

**No early exit.** Users can't leave before binary resolution. A "Yes" share priced at $0.80 drops to $0.00 the instant an event resolves wrong — no gradual path out. $20B+ is frozen waiting for yes/no outcomes, sometimes months away.

**No derivative layer.** Options, structured products, and leveraged positions all require a continuous, bounded, verifiable settlement signal. Binary resolution (0 or $1) can't be an underlying.

**No privacy.** Every prediction market action is fully visible on-chain — what you hold, when you exit, how much you receive. Large positions can't exit without signaling intent to the entire market. Settlement infrastructure that leaks trader activity is settlement infrastructure nobody will use at scale.

> Vektar builds the missing primitive: a settlement oracle that reads the CLOB, reports what a position can actually clear for, and keeps the entire pipeline private — from the market being priced to the payout being delivered.

---

## How It Works

Three CRE handlers, each triggered independently:

### Handler 1 — Settlement Oracle (cron, every 12s)

Fetches the Polymarket CLOB via Confidential HTTP (TEE-shielded `token_id`), reads locked collateral from Polygon, runs VWAP against live bid depth with TWOB anti-manipulation, and writes a BFT-signed settlement value to Base. The oracle tracks real exit value — not mark price:

```
T+0   Order book: $15k bids  →  Settlement: $6,300   (price says $7,500)
T+6h  Order book:  $3k bids  →  Settlement: $3,780   (price still $7,500)
T+12h Order book:   $0 bids  →  Settlement:     $0   (price still $7,500)
```

✅ `0xfa30f6...` — `updateSettlementValue` accepted by `SettlementVault.onReport()` on Tenderly.

### Handler 2 — Final Settlement (EVM log: `QuestionResolved`)

Fires automatically when UMA's CTF Adapter resolves. Decodes the event, maps `questionId` → `tokenId`, writes `settlePosition` to Base and `releaseOnSettlement` to Polygon. No manual invocation, no keeper network.

✅ Real Polygon mainnet tx `0x8ee8b5d...` (block 83622941). Both writes confirmed on Tenderly.

### Handler 3 — Private Payout (EVM log: `EarlyExitExecuted`)

Reads the user's shielded address from `SettlementVault`, loads the vault operator key from CRE secrets, signs an EIP-712 private transfer, and POSTs to the Convergence vault API with BFT consensus. Recipient, amount, and operator identity are all hidden — no on-chain link back to `earlyExit()`.

---

## Architecture

```
Polygon (Tenderly fork)    CRE Workflow (DON)           Base (Tenderly fork)
───────────────────────    ──────────────────           ────────────────────
CollateralEscrow     ──read──▶ Handler 1 (cron/12s) ──write──▶ SettlementVault
0x194E19AF...               Confidential HTTP                  0x287c88c8...
(locked CTF tokens)         VWAP + TWOB                        getSettlementValue()
                            BFT consensus                      earlyExit()
                                                               EarlyExitExecuted ↓
UMA CTF Adapter   ──log──▶ Handler 2          ──write──▶ settlePosition()
(QuestionResolved)          (final settlement)  ──write──▶ releaseOnSettlement()

                           Handler 3                          Convergence vault
                           (EarlyExitExecuted)  ──HTTP──▶    (Ethereum Sepolia)
                            reads: shielded addr             0xE588a6c7...
                            signs: EIP-712                   private-transfer API
                            key:   CRE secret                ACE compliance
                                                             shielded payout
```

### Contracts

| Contract | Chain | Address |
|---|---|---|
| `CollateralEscrow.sol` | Polygon (Tenderly mainnet fork) | `0x194E19AF9bfe69aDA8de9df3eAfAebbe60d0bC74` |
| `SettlementVault.sol` | Base (Tenderly mainnet fork) | `0x287c88c8c9245daa6a220fef38054fcd174e65c8` |
| `DemoCompliantPrivateTokenVault` | Ethereum Sepolia | `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` |
| CRE Forwarder (mock) | Base fork | `0x5e342a8438b4f5d39e72875fcee6f76b39cce548` |

### Key Interfaces

```solidity
// CollateralEscrow.sol (Polygon)
function depositCollateral(uint256 tokenId, uint256 amount) external;
function getLockedBalance(address user, uint256 tokenId) external view returns (uint256);

// SettlementVault.sol (Base) — public oracle interface
function getSettlementValue(uint256 tokenId) external view returns (uint256, uint256);
function getShieldedAddress(address user, uint256 tokenId) external view returns (address);
function earlyExit(uint256 tokenId) external;
function registerPosition(address user, uint256 tokenId, uint256 shares, address polygonAddress, address shieldedAddress) external;
```

### Collateral Security

Reading `balanceOf` on Polygon is exploitable: deposit shares, receive USDC on Base, transfer shares back before the next 12s cycle. `CollateralEscrow.sol` closes this window — shares lock on deposit and can only be released by the CRE DON:

```solidity
function releaseCollateral(address user, uint256 tokenId, uint256 amount)
    external onlyCREForwarder  // only the CRE DON can release
```

CRE reads `getLockedBalance()` — not `balanceOf`. The position is frozen until the DON authorizes release.

### Manipulation Resistance

Spoofing requires placing fake bids on Polymarket. Three layers make it unprofitable:

| Layer | Mechanism | Effect |
|---|---|---|
| **TWOB** | Oracle uses minimum liquidity over the last 5 cycles (60s) | Fake bids must persist for a full minute |
| **Rate limit** | Settlement value can increase ≤ 2% per cycle on-chain | Ramping from zero takes 37+ cycles (~7.5 min) |
| **Safety margin** | Oracle reports 90% of calculated exit liquidity | Built-in 10% haircut on every exploit attempt |

---

## Why Tenderly Virtual TestNets

A settlement oracle for prediction markets can't be tested on a blank testnet — it needs real Polymarket CTF token balances, real USDC liquidity, and real UMA resolution events. [Tenderly Virtual TestNets](https://tenderly.co/) provide exactly this: mainnet state synchronization with zero setup, so the CRE workflow operates against the same state it would in production.

### Virtual TestNets
| Chain | Virtual TestNet RPC | Explorer |
|---|---|---|
| Polygon | `https://virtual.polygon.eu.rpc.tenderly.co/4ad68571-...` | [Transactions](https://dashboard.tenderly.co/explorer/vnet/4ad68571-6a73-406b-ad62-a169a4593612) |
| Base | `https://virtual.base.eu.rpc.tenderly.co/2e625465-...` | [Explorer](https://dashboard.tenderly.co/explorer/vnet/2e625465-6c0e-4577-b01f-790eb8000996) |

Both configured in [`project.yaml`](apps/cre-workflow/vektar-engine/project.yaml) — the CRE simulator reads these directly.

### What Real Mainnet State Unlocks

**Handler 2 — real UMA resolution.** The `QuestionResolved` event that triggers final settlement comes from a real Polygon mainnet tx (`0x8ee8b5d...`, block 83622941). No synthetic events, no mock oracles — the CRE EVM log trigger fires on an actual historical market resolution.

**Handler 1 — real collateral reads.** The settlement oracle reads locked collateral from the Polygon Virtual TestNet. Because it's synced with mainnet state, `getLockedBalance()` returns values backed by real CTF token balances — the same values the oracle would read in production.

**Contract deployment — production-identical.** Contracts deploy to Virtual TestNets with the same gas model, precompiles, and token state as mainnet. The path from this demo to production is a config change (swap RPC URLs), not a rewrite.

### Tenderly-Specific Features Used

| Feature | How we use it |
|---|---|
| **Mainnet state sync** | Real Polymarket CTF tokens, USDC balances, and UMA events available without deploying to mainnet |
| **`tenderly_setErc20Balance`** | Admin RPC to seed USDC into `SettlementVault` for early exit payouts during demo |
| **Transaction tracing** | Full call traces for every CRE `onReport()` write — used to verify BFT-signed reports are accepted |
| **Unlimited faucet** | No gas constraints during CRE simulation — test all three handlers without funding wallets |
| **Zero-setup environment** | No local node, no genesis config — `project.yaml` points at Tenderly RPCs and the CRE simulator runs |

### CRE + Virtual TestNets Synergy

CRE workflows are inherently multi-chain — they read from one chain and write to another. Testing this without Virtual TestNets means either deploying to multiple live testnets (unreliable, no real state) or running local forks (no persistence, no explorer, no debugging). Virtual TestNets give us:

1. **Two persistent chains with real state** — Polygon and Base Virtual TestNets run simultaneously, each synced with mainnet
2. **CRE simulator connects directly** — `project.yaml` overrides point CRE at both Virtual TestNets; the simulator treats them as real chains
3. **Full observability** — every cross-chain write (settlement updates on Base, collateral releases on Polygon) is visible in the Tenderly dashboard with call traces and state diffs

---

## Privacy

| Layer | What's hidden | How |
|---|---|---|
| **Input** | `token_id`, full CLOB response | Confidential HTTP routes through TEE enclave — no DON node sees which market is being priced |
| **Keys** | `VAULT_OPERATOR_KEY` | `runtime.getSecret("vaultOperatorKey")` reads from Vault DON — never in code, logs, or on-chain |
| **Output** | Payout amount, recipient wallet, operator identity | Handler 3 POSTs to Convergence `/private-transfer` with `hide-sender`; Chainlink ACE enforces KYC/AML |

Before Vektar: any DON node log reveals which market is being priced, who called `earlyExit()`, how much they received, and where it went. After: none of it.

**ACE compliance check** — view function, no gas, live on Sepolia:

```bash
cast call 0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13 \
  "checkWithdrawAllowed(address,address,uint256)" \
  <WHITELISTED_ADDR> 0x779877A7B0D9E8603169DdbD7836e478b4624789 1000000000000000000 \
  --rpc-url https://rpc.sepolia.org
# Unknown address → reverts: operation_denied_by_policy
```

---

## Why CRE

This oracle requires five capabilities simultaneously. No other platform offers all of them:

| Capability | What it enables |
|---|---|
| **Confidential HTTP + BFT consensus** | Every DON node independently fetches the Polymarket CLOB through a TEE enclave. `token_id` never appears in node logs. Consensus ensures the result is as trustworthy as an on-chain read. |
| **Cross-chain reads** | CRE reads locked collateral from Polygon without bridging — native cross-chain state verification. |
| **Cross-chain writes** | Signed oracle reports with cryptographic proof, verified on-chain by the Chainlink Forwarder on Base and Polygon. |
| **Dual triggers** | Cron every 12s for continuous updates. EVM log on `QuestionResolved` for automatic final settlement — no keeper network. |
| **Secrets management** | Vault operator key lives in the CRE Vault DON. Never in code, logs, or on-chain. The only platform where credentialed offchain API calls can be orchestrated this way. |

> No bridge. Collateral stays on Polygon. Settlement executes on Base. Payouts are private.

---

## What This Enables

```solidity
// SettlementVault.sol (Base) — public oracle interface
function getSettlementValue(uint256 tokenId)
    external view
    returns (uint256 valueUSDC, uint256 lastUpdated);
```

Any protocol that calls this gets a consensus-verified, manipulation-resistant, cryptographically-proven settlement value for any active Polymarket position.

- **Prediction market lending** — LTV set by real exit value, not mark-to-market. The loan is always collateralized by what the position can actually clear for.
- **Options on prediction markets** — settlement value is bounded, continuous, and verifiable. A workable underlying in a way binary price is not.
- **Structured products** — pool prediction market positions, distribute settlement value across tranches.

Early exit is the simplest thing you can build on this oracle. It's not the most interesting.

---

## Files Using Chainlink CRE

Every file that integrates a Chainlink service, in execution order.

### Workflow Entry Point

| File | Chainlink primitive | What it does |
|---|---|---|
| [`vektar-engine/main.ts`](apps/cre-workflow/vektar-engine/main.ts) | `Runner.newRunner` · `CronCapability` · `EVMClient.logTrigger` · `cre.handler` | Registers all three triggers, constructs chain clients, wires handlers |

Config files (no SDK calls): [`workflow.yaml`](apps/cre-workflow/vektar-engine/workflow.yaml) · [`project.yaml`](apps/cre-workflow/vektar-engine/project.yaml) (Tenderly RPC overrides) · [`secrets.yaml`](apps/cre-workflow/secrets.yaml) (secret name mappings)

### Handlers

| File | Chainlink primitive | What it does |
|---|---|---|
| [`handlers/monitor-liquidity.ts`](apps/cre-workflow/vektar-engine/handlers/monitor-liquidity.ts) | Cron handler · `Runtime` | Handler 1 — runs every 12s; orchestrates CLOB fetch, collateral read, VWAP compute, oracle write |
| [`handlers/settle-position.ts`](apps/cre-workflow/vektar-engine/handlers/settle-position.ts) | EVM Log handler · `EVMLog` | Handler 2 — decodes `QuestionResolved`, writes `settlePosition` to Base and `releaseOnSettlement` to Polygon |
| [`handlers/private-payout.ts`](apps/cre-workflow/vektar-engine/handlers/private-payout.ts) | EVM Log handler · `EVMClient.callContract` · `runtime.getSecret` · `HTTPClient` · `consensusIdenticalAggregation` | Handler 3 — reads shielded address, loads operator key from Vault DON, POSTs private transfer with BFT consensus |

### Integrations

| File | Chainlink primitive | What it does |
|---|---|---|
| [`integrations/polymarket.ts`](apps/cre-workflow/vektar-engine/integrations/polymarket.ts) | `HTTPClient` · `consensusIdenticalAggregation` | Fetches Polymarket CLOB via Confidential HTTP; `token_id` shielded in TEE; all DON nodes must agree on the order book |
| [`integrations/collateral-reader.ts`](apps/cre-workflow/vektar-engine/integrations/collateral-reader.ts) | `EVMClient.callContract` · `getNetwork` | Reads `getTotalLocked(tokenId)` from `CollateralEscrow` on Polygon — no bridge |
| [`integrations/settlement-oracle-writer.ts`](apps/cre-workflow/vektar-engine/integrations/settlement-oracle-writer.ts) | `runtime.report` · `EVMClient.writeReport` · `getNetwork` | BFT-signed writes via Chainlink Forwarder: `updateSettlementValue` (Base), `settlePosition` (Base), `releaseOnSettlement` (Polygon) |

### Smart Contracts

| File | Chainlink primitive | What it does |
|---|---|---|
| [`contracts/base/SettlementVault.sol`](packages/contracts/src/base/SettlementVault.sol) | `IReceiver` · Chainlink Forwarder | `onReport()` — on-chain entry point for DON consensus; stores settlement value and authorizes `earlyExit()` |
| [`contracts/polygon/CollateralEscrow.sol`](packages/contracts/src/polygon/CollateralEscrow.sol) | `onlyCREForwarder` modifier | Accepts `releaseCollateral` only from the CRE DON — locks position until the DON authorizes release |

### Dashboard

| File | Chainlink primitive | What it does |
|---|---|---|
| [`hooks/useShieldedAddress.ts`](apps/dashboard/src/hooks/useShieldedAddress.ts) | Convergence vault API · EIP-712 | Signs a `Generate Shielded Address` typed-data request in-browser against the Convergence vault domain, POSTs to `/shielded-address` to derive the user's private payout address |

---

## Comparison

| | No Oracle | Price Feed Only | AI-Assisted Resolution | **Vektar** |
|---|---|---|---|---|
| **Settlement signal** | Binary (0 or $1) | Mark-to-market price | AI confidence score | **VWAP on live order book** |
| **Liquidity-aware?** | No | No | No | **Yes — actual bid depth, every 12s** |
| **Early exit?** | Wait for resolution | Sell on CLOB (slippage unknown) | Wait for resolution | **Instant at verified fair value** |
| **Settlement timing** | On resolution only | On resolution only | On resolution only | **Continuous + automatic on resolution** |
| **Data verification** | Trust the market | Trust single API | Trust an AI model | **BFT consensus across DON nodes** |
| **Cross-chain** | Single chain | Bridge required | Single chain | **No bridge — CRE orchestrates** |
| **Manipulation resistance** | None | Oracle risk | Model risk | **TWOB + rate limiting + safety margin** |
| **Settlement privacy** | None | None | None | **Confidential HTTP + ACE vault** |
| **$10k position, $2k liquidity** | $10k or $0 | $7,500 (wrong) | $7,500 (wrong) | **$2,700 (real exit value)** |

---

## End-to-End Demo Flow

A full walkthrough that runs all three CRE handlers against Tenderly Virtual TestNets. Prerequisites: `bun install`, CRE CLI, Foundry, and `apps/cre-workflow/.env` configured (see [Quick Start](#quick-start)).

### 1. Settlement Oracle (Handler 1)

Run one oracle cycle with live Polymarket order book data:

```bash
cd apps/cre-workflow
./run-normal.sh
# Expected: [TX] ✓ 0x... updateSettlementValue accepted
```

Watch the dashboard — settlement value and activity feed update. Then stress-test the liquidity illusion:

```bash
./run-thin.sh    # 90% liquidity drain — oracle drops, spot unchanged
./run-crisis.sh  # 97% drain + price decay — oracle collapses further
./run-normal.sh  # Recover
```

### 2. Early Exit + Private Payout (Handler 3)

**Must run before Handler 2** — early exit is for exiting before market resolution. Once Handler 2 (final settlement) runs, the position is closed and early exit is no longer possible.

> **Demo note:** Handler 3 sends 1 LINK to the shielded address because the Convergence vault is on Sepolia and only supports LINK. That 1 LINK represents the USDC settlement value — see [Challenges](#challenges).

Requires a position registered in the dashboard and an `earlyExit()` tx:

1. **Dashboard:** Register position, generate shielded address, click **Early Exit**
2. Copy the `EarlyExitExecuted` tx hash from Tenderly
3. Run Handler 3:

```bash
cre workflow simulate vektar-engine \
  --non-interactive --trigger-index 2 \
  --evm-tx-hash <EARLY_EXIT_TX_HASH> --evm-event-index 1 \
  --target local-simulation --broadcast
# Expected: [PRIVATE PAYOUT] ✅ transaction_id: ...
```

### 3. Final Settlement (Handler 2)

Trigger with a real UMA `QuestionResolved` tx from Polygon mainnet (available on Tenderly forks via mainnet state sync). Settles positions that did *not* early exit when the market resolves:

```bash
cd apps/cre-workflow
source .env
cre workflow simulate vektar-engine \
  --non-interactive --trigger-index 1 \
  --evm-tx-hash 0x8ee8b5d99c90758b31aa563c0be36e2082f7902f5ec9a2148859e7fa3eded5ec \
  --evm-event-index 1 \
  --target local-simulation --broadcast
# Expected: settlePosition on Base ✓, releaseOnSettlement on Polygon ✓
```

### 4. Verify On-Chain

```bash
source .env
cast call $SETTLEMENT_VAULT_ADDRESS \
  "getSettlementValue(uint256)(uint256,uint256)" \
  56078938060096976448086754249497300447360333783952000147427828224794011030104 \
  --rpc-url $BASE_TENDERLY_RPC
# Returns: (valueUSDC, lastUpdated)
```

### 5. Dashboard

```bash
cd apps/dashboard && bun dev  # http://localhost:5173
```

Ensure `apps/dashboard/.env.local` has `VITE_BASE_TENDERLY_RPC`, `VITE_SETTLEMENT_VAULT_ADDRESS`, etc. (see `apps/dashboard/.env.local.backup` for reference).

---

## Challenges

### Private Payout: 1 LINK vs USDC

The Convergence privacy vault used for Handler 3 is deployed on **Ethereum Sepolia** and supports only **LINK** — not USDC. The demo therefore sends **1 LINK** as a symbolic transfer. In production, the user would receive the full oracle settlement value in USDC on Base.

**Mitigation:** The Handler 3 logic is unchanged — it reads the `payout` from the `EarlyExitExecuted` event (the oracle settlement value in USDC 6 decimals). The only demo-specific part is the transfer amount sent to the Convergence API. In production, we would either:
- Deploy the Convergence vault on Base with USDC support and use the same `payout` value directly, or
- Scale the transfer amount via a LINK/USD price feed so the recipient receives LINK-equivalent value.

The 1 LINK in the demo is a placeholder representing the USDC value the user is entitled to — the privacy architecture (shielded address, BFT consensus, ACE compliance) is unchanged.

---

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) v1.2+, [Foundry](https://getfoundry.sh/), [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation)

```bash
bun install
cd apps/cre-workflow && cp env.template .env
# Edit .env: add Tenderly fork RPCs, CRE_ETH_PRIVATE_KEY, contract addresses
```

**Handler 1** — settlement oracle:

```bash
cd apps/cre-workflow
./run-normal.sh
# Or: cre workflow simulate vektar-engine --non-interactive --trigger-index 0 --target local-simulation --broadcast
```

**Handler 3** — private payout (run before Handler 2; requires `earlyExit()` tx hash from dashboard):

```bash
cd apps/cre-workflow
source .env
cre workflow simulate vektar-engine \
  --non-interactive --trigger-index 2 \
  --evm-tx-hash <TX_FROM_EARLY_EXIT> --evm-event-index 1 \
  --target local-simulation --broadcast
# Expected: [PRIVATE PAYOUT] ✅ transaction_id: ...
```

**Handler 2** — final settlement (UMA event; for positions that did not early exit):

```bash
cre workflow simulate vektar-engine \
  --non-interactive --trigger-index 1 \
  --evm-tx-hash 0x8ee8b5d99c90758b31aa563c0be36e2082f7902f5ec9a2148859e7fa3eded5ec \
  --evm-event-index 1 \
  --target local-simulation --broadcast
# Expected: settlePosition on Base ✓, releaseOnSettlement on Polygon ✓
```

**Dashboard:**

```bash
cd apps/dashboard && bun dev  # localhost:5173
```

**Check oracle value on-chain:**

```bash
cd apps/cre-workflow && source .env
cast call $SETTLEMENT_VAULT_ADDRESS \
  "getSettlementValue(uint256)(uint256,uint256)" \
  56078938060096976448086754249497300447360333783952000147427828224794011030104 \
  --rpc-url $BASE_TENDERLY_RPC
```

---

## Repo

```
apps/
  cre-workflow/vektar-engine/
    handlers/
      monitor-liquidity.ts        # Handler 1: settlement oracle (cron, every 12s)
      settle-position.ts          # Handler 2: final settlement (UMA QuestionResolved)
      private-payout.ts           # Handler 3: private payout (EarlyExitExecuted → Convergence)
    integrations/
      polymarket.ts               # Confidential HTTP CLOB fetch + order book parsing
      collateral-reader.ts        # Cross-chain read from Polygon CollateralEscrow
      settlement-oracle-writer.ts # Signed oracle report → SettlementVault.onReport()
    main.ts                       # Three-handler workflow registration
    workflow.yaml
    project.yaml                  # Tenderly fork RPC overrides for CRE simulator
    secrets.yaml                  # Maps VAULT_OPERATOR_KEY + VAULT_TOKEN to CRE secrets
  dashboard/
    src/
      hooks/                      # useSettlementValue, usePosition, useOrderBook,
                                  # useEarlyExit, useShieldedAddress, useActivityEvents,
                                  # useEventWatcher, useWallet, useRegisterPosition
      components/                 # SettlementOracle, OrderBookChart, EarlyExitButton,
                                  # PositionCard, ShieldedAddressCard, ActivityFeed
      pages/
        DemoPage.tsx              # Normal / thin / crisis scenario controls
packages/
  contracts/src/
    polygon/CollateralEscrow.sol  # Locks CTF tokens; only CRE DON can release
    base/SettlementVault.sol      # Oracle reports, earlyExit(), public getSettlementValue()
  core/ltv-engine/
    calculate-ltv.ts              # VWAP simulation against live bid levels
    twob-tracker.ts               # Time-weighted order book (anti-manipulation)
docs/                             # Architecture + contract specs
```

---

MIT — Built by Team Cyph for the Chainlink Convergence Hackathon
