# Vektar

**The settlement oracle for prediction markets.** Built on [Chainlink CRE](https://docs.chain.link/cre).

$20B+ sits in prediction markets. Protocols want to build on top — lending, leverage, options. Users want to exit before binary resolution. Both hit the same wall: there is no on-chain source for what a prediction market position can actually be **settled for**. Not what it's priced at. What it clears for, right now, against real order book depth.

```
getPrice("ETH/USD")         → $3,241   ✓  (Chainlink)
isMarketResolved(id)        → true     ✓  (UMA)
getSettlementValue(tokenId) → ???      ✗  (nobody)  ← this is what Vektar builds
```

Every 12 seconds, a CRE workflow fetches the live Polymarket order book via Confidential HTTP with BFT consensus, simulates the real exit cost via VWAP, and publishes a cryptographically-signed settlement value on-chain. Any protocol can read `getSettlementValue(tokenId)` — a public oracle, like Chainlink price feeds but for prediction market exit liquidity.

We also built the first application on top of it: **early exit**. Users call `earlyExit()` to receive the oracle's settlement value in USDC immediately — position exits privately, no waiting for binary resolution. This is not the product. This is proof the oracle works.

---

## Track Fit

**Prediction Markets.** Vektar is event-driven market resolution infrastructure. Handler 2 fires automatically on UMA's `QuestionResolved` event on Polygon — no human step, no keeper network. Handler 1 continuously tracks real exit value using offchain CLOB data with BFT consensus across every DON node. This is automated, verifiable settlement of prediction markets based on real-world data signals.

**Privacy.** Three layers, all using Chainlink's privacy stack:
- **Confidential HTTP** — Polymarket CLOB queries route through a TEE enclave. `token_id` never appears in node logs. Which market Vektar is pricing stays private.
- **CRE Secrets Management** — the vault operator key used to authorize private payouts lives in the CRE Vault DON. It never touches code, logs, or the chain.
- **Compliant Non-Public Token Movement** — when a user calls `earlyExit()`, Handler 3 routes the settlement to a shielded address via the Convergence 2026 private vault. Payout amount, recipient wallet, and operator identity are all hidden. Chainlink ACE enforces KYC/AML on every vault operation.

---

## Core Innovations

**First settlement oracle for prediction markets.** Not a price feed. Not a resolution oracle. A *settlement value* oracle — the verifiable, liquidity-weighted value at which a position can actually be exited. This primitive doesn't exist today. Every protocol building on prediction markets needs it.

**Novel data signal: order book depth.** Every existing oracle uses price or binary outcome as the settlement signal. Vektar is the first to use live CLOB order book depth — the actual buy-side liquidity your position would clear against. This is the only signal that answers "what will I walk away with?"

**Dual settlement model.** Continuous oracle updates every 12 seconds (cron trigger) *and* automatic final settlement on market resolution (EVM log trigger on `QuestionResolved`). Most oracles are one or the other. Vektar runs both — the oracle tracks real exit value throughout a market's life, then fires the instant UMA resolves.

**Cross-chain without bridging.** Collateral lives on Polygon (where Polymarket is). Settlement executes on Base (where DeFi liquidity is). CRE orchestrates reads and writes across both chains with BFT consensus. No bridge. No wrapped tokens.

**Manipulation-resistant by design.** Three independent layers — time-weighted order book averaging, rate-limited on-chain updates, and a 10% safety margin — make oracle spoofing economically unprofitable.

**Private by design — input and output.** Confidential HTTP hides CLOB query parameters from node logs (input privacy). CRE secrets manage the vault operator key. Handler 3 routes payouts to shielded addresses via Chainlink ACE-enforced private vault (output privacy). The full settlement flow — which market is being priced, who is getting paid, and how much — is private.

---

## The Problem

Three specific ways the current model fails any protocol trying to build on prediction markets:

**The Binary Gap.** A "Yes" share priced at $0.80 drops to $0.00 the instant an event resolves wrong. There's no gradual decline — it's a single block. Any protocol that settles on price is exposed to a gap that can wipe out the entire collateral value between the last oracle update and resolution. No gradual liquidation path exists.

**The Liquidity Illusion.** A user holds $100k of "Yes" shares (mark-to-market). The Polymarket order book has $5k of buy-side depth. Their real exit value is $5k. Every price oracle on the market reports $100k. There is no consensus-verified source for the real number — the CLOB is offchain, and nobody has built a settlement oracle that reads it.

**Capital Frozen Until Binary Resolution.** $20B+ is locked in prediction markets waiting for yes/no outcomes — sometimes months away. There is no infrastructure for users to exit at a fair, verifiable value before resolution. Not because it's technically impossible, but because the primitive that would enable it — a settlement value oracle — doesn't exist.

Vektar builds that primitive.

---

## How It Works

Three CRE handlers, each triggered independently:

### Handler 1 — Settlement Oracle (cron, every 12s)

1. **Fetches the order book** — Polymarket CLOB API via `ConfidentialHTTPClient`. The `token_id` query parameter routes through a TEE enclave — which market is being priced is never visible in node logs.
2. **Reads locked collateral** — `CollateralEscrow` on Polygon via cross-chain EVM read, no bridge.
3. **Simulates a market sell** — VWAP against live bid levels with Time-Weighted Order Book (TWOB) anti-manipulation. Applies 10% safety margin.
4. **Writes a signed oracle report** — `settlementValueUSDC` to `SettlementVault` on Base, with cryptographic proof from BFT DON consensus.

Here's the oracle running on the same position as liquidity dries up:

```
T+0  (normal market)
  Order book: $15k of bids
  VWAP simulation: $0.70 / share
  → Settlement value: $6,300   (price says $7,500)

T+6h (liquidity thinning before resolution)
  Order book: $3k of bids
  VWAP simulation: $0.42 / share
  → Settlement value: $3,780   (price still says $7,500)

T+12h (event imminent, book empty)
  Order book: $0 of bids
  → Settlement value: $0       (price still says $7,500)
```

**Verified:** Handler 1 simulation produced a real Tenderly transaction — `0xfa30f6...` — showing `updateSettlementValue` accepted by `SettlementVault.onReport()`.

### Handler 2 — Final Settlement (EVM log: `QuestionResolved` on Polygon)

Fires automatically when UMA's CTF Adapter emits `QuestionResolved`. Decodes the event, maps `questionId` to `tokenId`, writes `settlePosition` to Base and `releaseOnSettlement` to Polygon. No manual invocation.

**Verified:** Simulated using a real Polygon mainnet tx (`0x8ee8b5d...`, block 83622941). Both Base and Polygon writes confirmed on Tenderly.

### Handler 3 — Private Payout (EVM log: `EarlyExitExecuted` on Base)

Fires when a user calls `earlyExit()`. Reads the user's registered shielded address from `SettlementVault.getShieldedAddress()`. Signs an EIP-712 private transfer with the vault operator key (from CRE secrets — never in code). Calls `POST /private-transfer` on the Convergence 2026 private vault API via `runtime.HTTP()`.

Result: payout amount credited to the user's shielded address on Ethereum Sepolia. Recipient and amount are hidden. Operator identity is hidden via `hide-sender` flag. No on-chain link between the `earlyExit()` call and the payout destination.

---

## Privacy Architecture

```
VEKTAR PRIVACY STACK

Layer 1 — Input privacy (Confidential HTTP)
  Signal:   Polymarket CLOB order book
  What's hidden: token_id in the request URL, full order book response
  How: ConfidentialHTTPClient routes through a TEE enclave.
       No DON node ever sees which market Vektar is pricing.
  Track: CRE Confidential HTTP capability ✓

Layer 2 — Key management (CRE Secrets)
  Signal:   Vault operator authorization
  What's hidden: VAULT_OPERATOR_KEY — never in code, logs, or any on-chain tx
  How: runtime.getSecret("vaultOperatorKey") reads from the CRE Vault DON.
       The key signs an EIP-712 message; the signature goes in the request body.
       The key itself is never transmitted.
  Track: "without exposing secrets" ✓

Layer 3 — Output privacy (Convergence 2026 + Chainlink ACE)
  Signal:   Settlement payout
  What's hidden: payout amount, recipient wallet, operator identity
  How: Handler 3 calls POST /private-transfer on the Convergence vault API.
       Funds move to the user's shielded address.
       hide-sender flag conceals operator identity from the recipient too.
       Chainlink ACE enforces KYC/AML on every vault deposit and withdrawal.
  Track: "compliant non-public token movement" ✓
```

Every vector is covered. Before Vektar: watching any DON node log reveals which market is being priced, who called `earlyExit()`, how much they received, and where it went. After Vektar: nothing.

### Compliance demo

```bash
# ACE policy enforcement — view function, no gas, live on Sepolia
# Whitelisted address → passes
cast call 0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13 \
  "checkWithdrawAllowed(address,address,uint256)" \
  <WHITELISTED_ADDR> 0x779877A7B0D9E8603169DdbD7836e478b4624789 1000000000000000000 \
  --rpc-url https://rpc.sepolia.org

# Unknown address → reverts: operation_denied_by_policy
```

### Why the payout goes through CRE instead of a direct cross-chain call

`SettlementVault` lives on a Tenderly Base mainnet fork. The Convergence private vault lives on Ethereum Sepolia. They cannot call each other. Handler 3 is CRE acting as the privacy bridge — it watches the Base event and calls the Sepolia vault API using operator credentials stored as CRE secrets. No bridge, no wrapped tokens, no on-chain cross-chain call.

In production, deploying the private vault on the same chain as `SettlementVault` collapses this to a direct contract call inside `earlyExit()` — Handler 3 goes away entirely.

---

## The Reference App: Early Exit

The oracle is infrastructure — `SettlementVault.getSettlementValue(tokenId)` is public, any protocol can consume it. We ship one reference application to prove it end-to-end.

Users register a shielded address, then deposit prediction market shares into `CollateralEscrow` on Polygon. On Base, they call `earlyExit()` — receiving USDC immediately at the oracle's current settlement value. Handler 3 routes the payout privately.

```
User registers shielded address → generated in browser via viem (no external call)
User deposits 20,000 YES shares → locked in CollateralEscrow (Polygon)
CRE oracle: settlement value = $7,380 USDC (20,000 shares × $0.369)
User calls earlyExit() → $7,380 USDC from SettlementVault (Base)
Handler 3 fires → 1 LINK → user's shielded address (Convergence vault, Sepolia)
  └─ amount hidden, recipient shielded, operator identity hidden
[Resolution] UMA resolves → Handler 2 fires → settlePosition() on Base, releaseOnSettlement() on Polygon
```

**Demo market:** Will Bitcoin reach $100,000 by Dec 31, 2026? YES token ID: `5607893806009697644...`

**Dashboard** shows the live oracle running: settlement value updating every 12 seconds, order book chart with normal/thin/crisis scenario controls, position status, shielded address, early exit button with the four-state flow (pending → confirmed → routing private → complete), and an activity feed of every `SettlementValueUpdated` and `EarlyExitExecuted` event linked to Tenderly.

---

## What This Enables

The oracle interface is four lines of Solidity:

```solidity
// SettlementVault.sol (Base) — public oracle interface
function getSettlementValue(uint256 tokenId)
    external view
    returns (uint256 valueUSDC, uint256 lastUpdated);
```

Any protocol that calls this gets a consensus-verified, manipulation-resistant, cryptographically-proven settlement value for any active Polymarket position. What becomes possible:

**Prediction market lending.** Borrow USDC against locked prediction market shares, with LTV set by the oracle's real exit value — not mark-to-market price. The loan is always collateralized by what the position can actually clear for.

**Options on prediction markets.** Price puts and calls using the oracle's settlement value as the underlying. The settlement value is bounded, continuous, and verifiable — it's a workable options underlying in a way that binary price is not.

**Structured products.** Yield products that pool prediction market positions and distribute settlement value across tranches. The oracle gives structured product designers a reliable input they've never had.

Early exit is the simplest thing you can build on this oracle. It's not the most interesting.

---

## Collateral Security

A naive implementation would read `balanceOf` on Polygon to verify the user's position. This is exploitable: deposit shares, receive USDC on Base, then transfer the shares on Polygon before the next CRE cycle. Twelve seconds is enough.

We deploy `CollateralEscrow.sol` on Polygon specifically to close this window. Shares are transferred into the contract on deposit and can only be released by the CRE DON — not by the user:

```solidity
// CollateralEscrow.sol (Polygon)
function depositCollateral(uint256 tokenId, uint256 amount) external {
    IERC1155(CTF_ADDRESS).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
    lockedBalance[msg.sender][tokenId] += amount;
}

function releaseCollateral(address user, uint256 tokenId, uint256 amount)
    external onlyCREForwarder  // only the CRE DON can release
{
    lockedBalance[user][tokenId] -= amount;
    IERC1155(CTF_ADDRESS).safeTransferFrom(address(this), user, tokenId, amount, "");
}
```

CRE reads `getLockedBalance()` — not `balanceOf`. The position is verifiably frozen from the moment of deposit until the CRE DON authorizes release after settlement.

---

## Why This Requires CRE

This oracle cannot be built on any other platform. It requires six capabilities simultaneously:

**Consensus on offchain APIs.** Every DON node independently fetches the Polymarket CLOB via Confidential HTTP. BFT consensus across nodes ensures no single node can manipulate the settlement value. The order book data is as trustworthy as any on-chain read.

**Confidential HTTP.** The Polymarket CLOB request routes through a TEE enclave — `token_id` and the full response are hidden from node logs. API credentials can be injected via Vault DON secrets without appearing in workflow config. No other oracle platform offers this.

**Cross-chain reads.** Collateral is on Polygon. CRE reads the locked escrow balance without bridging — native cross-chain state verification.

**Cross-chain writes.** Settlement executes on Base. CRE writes signed oracle reports with cryptographic proof, verified on-chain by the Chainlink Forwarder.

**Dual triggers.** Cron every 12s for continuous settlement value updates. EVM log trigger on `QuestionResolved` for automatic final settlement — no manual invocation, no keeper network required.

**Secrets management for private API calls.** Handler 3's vault operator key lives in the CRE Vault DON — `runtime.getSecret("vaultOperatorKey")`. It is never in code, never in logs, never on-chain. This is the only platform where credentialed offchain API calls can be orchestrated this way.

No bridge. Collateral stays on Polygon. Settlement executes on Base. Payouts are private.

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

**Contracts:**

| Contract | Chain | Address |
|----------|-------|---------|
| `CollateralEscrow.sol` | Polygon (Tenderly mainnet fork) | `0x194E19AF9bfe69aDA8de9df3eAfAebbe60d0bC74` |
| `SettlementVault.sol` | Base (Tenderly mainnet fork) | `0x287c88c8c9245daa6a220fef38054fcd174e65c8` |
| `DemoCompliantPrivateTokenVault` | Ethereum Sepolia | `0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13` |
| CRE Forwarder (mock) | Base fork | `0x5e342a8438b4f5d39e72875fcee6f76b39cce548` |

**Why Tenderly mainnet forks:** Polymarket's real CTF token state exists on Polygon mainnet. Real USDC is on Base mainnet. Real UMA `QuestionResolved` events are on Polygon mainnet. Using mainnet forks means Handler 2 can be triggered with a real historical UMA tx hash — no mock oracles, no mock events.

**Key interfaces:**

```solidity
// CollateralEscrow.sol
function depositCollateral(uint256 tokenId, uint256 amount) external;
function getLockedBalance(address user, uint256 tokenId) external view returns (uint256);

// SettlementVault.sol
function getSettlementValue(uint256 tokenId) external view returns (uint256, uint256);
function getShieldedAddress(address user, uint256 tokenId) external view returns (address);
function earlyExit(uint256 tokenId) external;
function registerPosition(address user, uint256 tokenId, uint256 shares, address polygonAddress, address shieldedAddress) external;
```

---

## Manipulation Resistance

Spoofing the oracle requires placing fake bids on Polymarket. Three things make this unprofitable:

**Time-Weighted Order Book (TWOB).** The oracle uses the minimum liquidity seen over the last 5 cycles — 60 seconds. Fake bids must persist for a full minute, not just one block.

**Rate-limited updates.** Settlement value can increase at most 2% per cycle on-chain. Ramping from zero to peak takes 37+ cycles (~7.5 minutes) regardless of what the order book shows.

**Safety margin.** Oracle reports 90% of calculated exit liquidity — a built-in buffer against partial fills and last-second manipulation.

Combined: profitable exploitation requires real capital on Polymarket for 60+ seconds, 7+ minutes of patience, and a 10% haircut on exit. Economically unprofitable at any realistic scale.

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
| **Settlement privacy** | None | None | None | **Private payouts — Confidential HTTP + ACE vault** |
| **$10k position, $2k liquidity** | $10k or $0 | $7,500 (wrong) | $7,500 (wrong) | **$2,700 (real exit value)** |

---

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) v1.2+, [Foundry](https://getfoundry.sh/), [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation)

```bash
bun install

# Set up environment — Tenderly fork RPCs and contract addresses
# See apps/cre-workflow/.env for the full variable list
cp env.template apps/cre-workflow/.env
```

**Run Handler 1 — settlement oracle (cron trigger):**
```bash
cd apps/cre-workflow
cre workflow simulate vektar-engine --non-interactive --trigger-index 0
# Expected: [TX] 0xfa30f6... ✓  updateSettlementValue accepted
```

**Run Handler 2 — final settlement (UMA event trigger):**
```bash
cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 1 \
  --evm-tx-hash 0x8ee8b5de01a44a65b793eadc0be5a3e1a6d4a0b7d95cca29eb96e1aadc30e4dc \
  --evm-event-index 0
# Expected: settlePosition on Base ✓, releaseOnSettlement on Polygon ✓
```

**Run Handler 3 — private payout (EarlyExitExecuted trigger):**
```bash
# First call earlyExit() on the Base fork, then:
cre workflow simulate vektar-engine \
  --non-interactive \
  --trigger-index 2 \
  --evm-tx-hash <TX_FROM_EARLY_EXIT> \
  --evm-event-index 1
# Expected: [PRIVATE PAYOUT] ✅ transaction_id: 019cc054-...
```

**Dashboard:**
```bash
cd apps/dashboard && bun dev
# Opens at localhost:5173
# Toggle normal/thin/crisis scenarios to show the liquidity illusion live
```

**Check oracle value on-chain:**
```bash
cast call 0x287c88c8c9245daa6a220fef38054fcd174e65c8 \
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
