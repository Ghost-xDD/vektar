# Vektar

**Settlement oracle and early exit infrastructure for prediction markets.** Built on [Chainlink CRE](https://docs.chain.link/cre).

$20B+ sits in prediction markets. Protocols want to build on top — lending, leverage, options. Users want to exit before binary resolution. Both hit the same wall: there is no on-chain source for what a prediction market position can actually be **settled for**. Not what it's priced at. What it clears for, right now, against real order book depth.

```
getPrice("ETH/USD")         → $3,241   ✓  (Chainlink)
isMarketResolved(id)        → true     ✓  (UMA)
getSettlementValue(tokenId) → ???      ✗  (nobody)  ← the oracle  — any protocol consumes it
earlyExit(tokenId)          → ???      ✗  (nobody)  ← the app     — users settle now, not at resolution
```

Vektar builds both. Every 12 seconds, a CRE workflow fetches the live Polymarket order book with BFT consensus, simulates the real exit cost via VWAP, and publishes a cryptographically-signed settlement value on-chain. Any protocol can consume the oracle. Users can call `earlyExit()` to receive the settlement value in USDC immediately — position exits privately, no waiting for binary resolution.

---

## Core Innovations

**First settlement oracle for prediction markets.** Not a price feed. Not a resolution oracle. A *settlement value* oracle — the verifiable, liquidity-weighted value at which a position can actually be exited. This primitive doesn't exist today. Every protocol building on prediction markets needs it.

**Novel data signal: order book depth.** Every existing oracle uses price or binary outcome as the settlement signal. Vektar is the first to use live CLOB order book depth — the actual buy-side liquidity your position would clear against. This is the only signal that answers "what will I walk away with?"

**Dual settlement model.** Continuous oracle updates every 12 seconds (cron trigger) *and* automatic final settlement on market resolution (EVM log trigger). Most oracles are one or the other. Vektar runs both — the oracle tracks real exit value throughout a market's life, then fires settlement the instant the market resolves.

**Cross-chain without bridging.** Collateral lives on Polygon (where Polymarket is). Settlement executes on Base (where DeFi liquidity is). CRE orchestrates reads and writes across both chains with BFT consensus. No bridge. No wrapped tokens. No $2B bridge hack exposure.

**Manipulation-resistant by design.** Three independent layers — time-weighted order book averaging, rate-limited on-chain updates, and a 10% safety margin — make oracle spoofing economically unprofitable. This isn't bolted on; it's the core of why the oracle is trustworthy.

**Private by design.** Every `earlyExit()` payout routes through a Chainlink ACE-enforced private vault — amounts and recipient identities are never public on-chain. CRE handles both sides: Confidential HTTP hides which market is being priced (input privacy); CRE secrets management and private transfers hide who gets paid and how much (output privacy). Large players can exit without broadcasting their move to the market.

---

## The Problem

Three specific ways the current model fails any protocol trying to build on prediction markets:

**The Binary Gap.** A "Yes" share priced at $0.80 drops to $0.00 the instant an event resolves wrong. There's no gradual decline — it's a single block. Any protocol that settles on price is exposed to a gap that can wipe out the entire collateral value between the last oracle update and resolution. No gradual liquidation path exists.

**The Liquidity Illusion.** A user holds $100k of "Yes" shares (mark-to-market). The Polymarket order book has $5k of buy-side depth. Their real exit value is $5k. Every price oracle on the market reports $100k. There is no consensus-verified source for the real number — the CLOB is offchain, and nobody has built a settlement oracle that reads it.

**Capital Frozen Until Binary Resolution.** $20B+ is locked in prediction markets waiting for yes/no outcomes — sometimes months away. There is no infrastructure for users to exit at a fair, verifiable value before resolution. Not because it's technically impossible, but because the primitive that would enable it — a settlement value oracle — doesn't exist.

Vektar builds that primitive.

---

## How It Works

Every 12 seconds, a CRE workflow:

1. **Fetches the order book** — Polymarket CLOB API with BFT consensus across all DON nodes
2. **Reads locked collateral** — `CollateralEscrow` on Polygon (cross-chain read, no bridge)
3. **Simulates a market sell** — VWAP against live bids, calculates what the position actually clears for after slippage
4. **Writes a signed oracle report** — settlement value to `SettlementVault` on Base with cryptographic proof

A second handler fires on UMA's `QuestionResolved` event on Polygon — final settlement executes on Base automatically, no human step.

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

The oracle reflects what the market can actually bear. Price-based settlement is wrong in every scenario above.

---

## The Reference App: Early Exit

The oracle is infrastructure — `SettlementVault.getSettlementValue(tokenId)` is public, any protocol can consume it. We ship one reference application to prove it end-to-end.

Users deposit prediction market shares into `CollateralEscrow` on Polygon, then call `earlyExit()` on Base — receiving USDC immediately at the oracle's current settlement value. The settlement pool holds the position and redeems it at resolution.

```
User deposits 10,000 YES shares → locked in CollateralEscrow (Polygon)
  └─ registers shielded address → identity unlinked on-chain
CRE oracle: settlement value = $6,300
User calls earlyExit() → $6,300 routed to private vault (Sepolia)
  └─ amount hidden, recipient shielded — no public trace
[3 weeks later] UMA resolves YES → CRE fires → pool redeems → $10,000
Pool spread: $3,700
```

This is not the product. This is proof the oracle works. Lending, leverage, options — any protocol building on prediction markets needs `getSettlementValue()`. We're the first to build it.

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

**Consensus on offchain APIs.** Every DON node independently fetches the Polymarket CLOB. BFT consensus across nodes ensures no single node can manipulate the settlement value — the order book data is as trustworthy as any on-chain read.

**Cross-chain reads.** Collateral is on Polygon. CRE reads the locked escrow balance without bridging — native cross-chain state verification.

**Cross-chain writes.** Settlement executes on Base. CRE writes signed oracle reports with cryptographic proof, verified on-chain by the Chainlink Forwarder.

**Dual triggers.** Cron every 12s for continuous settlement value updates. EVM log trigger on `QuestionResolved` for automatic final settlement — no manual invocation, no keeper network required.

**Cryptographic proofs.** Every oracle update is a signed DON report. The settlement value isn't a trusted call from a server — it's a proven output from a distributed consensus process.

**Secrets management for private API calls.** When `earlyExit()` fires, a third CRE handler routes the payout to the user's shielded address via the private vault API — using a vault operator key stored as a CRE workflow secret, never in code or logs. Confidential HTTP keeps CLOB query parameters out of node logs. No other oracle platform can do credentialed offchain API calls with secrets managed this way.

No bridge. Collateral stays on Polygon. Settlement executes on Base. Payouts are private.

---

## Architecture

```
Polygon              CRE (DON)                  Base              Sepolia
───────              ─────────                  ────              ───────
CollateralEscrow ──read──▶ Workflow ──write──▶ SettlementVault
(locked tokens)            (every 12s)          earlyExit() ↓
                                                      │
UMA CTF Adapter ──log───▶  settlePosition ──────────▶ settlePosition()
(QuestionResolved)                                    (final settlement)
                           │
                           └──▶ Handler 3 ──HTTP──▶ PrivateVault
                                (EarlyExitExecuted     (shielded payout
                                 log trigger)           amount + recipient hidden)
```

**Contracts:**

| Contract | Chain | Role |
|----------|-------|------|
| `CollateralEscrow.sol` | Polygon | Locks CTF tokens; only CRE DON can release |
| `SettlementVault.sol` | Base | Stores oracle reports; executes early exits; public `getSettlementValue()` |
| `DemoCompliantPrivateTokenVault` | Sepolia | Chainlink ACE-enforced private vault; hidden balances and transfers |

**Key interfaces:**

```solidity
// CollateralEscrow.sol
function depositCollateral(uint256 tokenId, uint256 amount) external;
function getLockedBalance(address user, uint256 tokenId) external view returns (uint256);

// SettlementVault.sol
function getSettlementValue(uint256 tokenId) external view returns (uint256, uint256);
function getShieldedAddress(address user, uint256 tokenId) external view returns (address);
function earlyExit(uint256 tokenId) external;
function updateSettlementValue(uint256 tokenId, uint256 value, bytes calldata proof) external onlyCREForwarder;
function settlePosition(address user, uint256 tokenId, uint8 outcome, bytes calldata proof) external onlyCREForwarder;
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
| **Settlement timing** | On resolution only | On resolution only | On resolution only | **Continuous + on resolution** |
| **Data verification** | Trust the market | Trust single API | Trust an AI model | **BFT consensus across DON nodes** |
| **Cross-chain** | Single chain | Bridge required | Single chain | **No bridge — CRE orchestrates** |
| **Manipulation resistance** | None | Oracle risk | Model risk | **TWOB + rate limiting + safety margin** |
| **Settlement privacy** | None | None | None | **Private payouts — amounts and recipients hidden** |
| **$10k position, $2k liquidity** | $10k or $0 | $7,500 (wrong) | $7,500 (wrong) | **$2,700 (real exit value)** |

---

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) v1.2.14+, [Foundry](https://getfoundry.sh/), [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation), Node.js v20+

```bash
bun install
cd packages/contracts && forge install
cp .env.example .env

bun run workflow:simulate         # CRE simulation
bun run contracts:deploy:polygon  # Polygon Amoy
bun run contracts:deploy:base     # Base Sepolia
bun test
```

---

## Repo

```
apps/cre-workflow/vektar-engine/
  handlers/
    monitor-liquidity.ts           # Handler 1: settlement oracle (cron, every 12s)
    settle-position.ts             # Handler 2: final settlement (UMA event trigger)
    private-payout.ts              # Handler 3: private vault routing (EarlyExitExecuted trigger)
packages/contracts/src/
  polygon/CollateralEscrow.sol
  base/SettlementVault.sol
packages/core/settlement-engine/   # VWAP calculation
docs/                              # Architecture + contract specs
```

---

MIT — Built by Team Cyph for the Chainlink Convergence Hackathon
