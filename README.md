# Vektar

**Prediction Market Derivative Settlement Infrastructure**

Vektar is **prediction market derivative settlement infrastructure**, built on CRE (Chainlink Runtime Environment).

Today, prediction markets settle on a single binary question: *"Did the event happen?"* — yes or no, $1 or $0. That's it. There are no derivatives, no composability, and $20B+ in capital sits idle waiting for resolution.

**We introduce a new settlement signal: real-time order book liquidity.**

Instead of only asking "did it happen?", Vektar continuously asks **"how liquid is this market right now?"** — and uses that as a data signal to settle derivative positions (borrowing, leverage, DeFi composability) on top of prediction markets.

## How it works with CRE

Every 12 seconds, a CRE workflow:
1. **Fetches offchain data** — Polymarket CLOB order book (with BFT consensus across DON nodes)
2. **Reads on-chain state** — user's escrowed collateral on Polygon (cross-chain read)
3. **Computes a Dynamic LTV** — simulates selling into the order book, calculates real exit value
4. **Writes settlement parameters** — updates the lending contract on Base (cross-chain write with cryptographic proof)

When a market resolves (UMA oracle emits an event on Polygon), a second CRE handler automatically triggers final settlement — calculating payouts and executing them on Base without human intervention.

**CRE makes this possible because it's the only platform that can do all five:**
- ✅ Consensus on offchain APIs (Polymarket order book)
- ✅ Cross-chain reads (Polygon collateral state)
- ✅ Cross-chain writes (Base settlement layer)
- ✅ Dual triggers (cron for continuous monitoring + event log for resolution)
- ✅ Cryptographic proofs (signed DON reports verified on-chain)

## The Three Layers

| Layer | What It Does | Where It Lives |
|-------|-------------|----------------|
| **Collateral Escrow** | Locks user's prediction market shares | Polygon (where Polymarket lives) |
| **Dynamic LTV Engine** | Monitors liquidity, computes settlement values, triggers liquidations | CRE Workflow (offchain consensus) |
| **Lending & Settlement Pool** | Manages borrowing, repayment, and automated settlement | Base (where DeFi liquidity lives) |

No bridging. Collateral stays on Polygon. Settlement happens on Base. CRE orchestrates across both with BFT consensus.

## The Result: Bad Debt Prevention Through Liquidity Awareness

| Scenario | Traditional (Aave/Compound) | Vektar |
|----------|---------------------------|--------|
| **User has:** | $10k of "Yes" shares @ $0.75 | $10k of "Yes" shares @ $0.75 |
| **Order book:** | Only $2k liquidity (ignored) | Only $2k liquidity (detected) |
| **LTV calculation:** | 75% (static) | 27% (dynamic, based on liquidity) |
| **Max borrow:** | $7,500 | $2,700 |
| **Price crashes to $0:** | Can liquidate for $2k → $5.5k BAD DEBT ❌ | Can liquidate for $2k → Fully covered ✅ |

**Tech Stack:** CRE (consensus + dual triggers + cross-chain orchestration), Polygon (Polymarket + collateral escrow), Base (settlement layer)

## Monorepo Structure

```
vektar/
├── apps/
│   ├── cre-workflow/        # CRE Dynamic LTV Engine
│   │   ├── vektar-engine/   # Main workflow
│   │   └── project.yaml     # RPC configs
│   └── dashboard/           # (Future) Monitoring UI
├── packages/
│   ├── contracts/           # Solidity smart contracts
│   │   ├── src/
│   │   │   ├── polygon/     # CollateralEscrow.sol
│   │   │   └── base/        # HorizonVault.sol, LendingPool.sol
│   │   └── script/          # Deployment scripts
│   ├── core/                # Shared TypeScript logic
│   │   ├── ltv-engine/      # LTV calculation
│   │   └── types/           # Shared types
│   └── config/              # Shared configs (tsconfig, etc.)
└── docs/                    # Documentation
```

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) v1.2.14+
- [Foundry](https://getfoundry.sh/) (forge, cast)
- [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation)
- Node.js v20+

### Installation

```bash
# Install dependencies
bun install

# Install contract dependencies
cd packages/contracts && forge install

# Copy environment template
cp .env.example .env
# Fill in: RPC URLs, private keys, API keys
```

### Development

```bash
# Run CRE workflow simulation
bun run workflow:simulate

# Deploy contracts to testnets
bun run contracts:deploy:polygon  # Mumbai testnet
bun run contracts:deploy:base     # Base Sepolia

# Run tests
bun test
```

## Core Technologies

- **[Chainlink CRE](https://docs.chain.link/cre)** - Cross-chain orchestration with BFT consensus
- **[Foundry](https://getfoundry.sh/)** - Smart contract development
- **[Viem](https://viem.sh/)** - TypeScript Ethereum interactions
- **[Zod](https://zod.dev/)** - Runtime type validation
- **[Turbo](https://turbo.build/)** - Monorepo build system

## Key Features

### 1. Dual Trigger Architecture
- **Cron Trigger**: Runs every 12 seconds for continuous liquidity monitoring
- **EVM Log Trigger**: Event-driven settlement when UMA oracle resolves markets

### 2. BFT Consensus on API Calls
- All Polymarket API calls verified across multiple CRE nodes
- Cryptographic proofs for every on-chain write
- No single point of failure

### 3. Cross-Chain Without Bridging
- Collateral stays on Polygon (no bridge risk)
- Settlement happens on Base (where DeFi liquidity lives)
- CRE orchestrates state verification across chains

### 4. Spoofing Protection
- Time-Weighted Order Book (TWOB) averaging
- Rate-limited LTV increases (max 2% per cycle)
- 10% safety margin on all calculations

## Documentation

- [CRE Patterns Analysis](../CRE_PATTERNS_FOR_EVENT_HORIZON.md)
- [Architecture Deep Dive](./docs/ARCHITECTURE.md)
- [Smart Contract Specs](./packages/contracts/README.md)
- [Workflow Guide](./apps/cre-workflow/README.md)

## Development Roadmap

### Phase 1: Core Infrastructure (Current)
- [x] Monorepo scaffolding
- [ ] Smart contracts (CollateralEscrow, HorizonVault, LendingPool)
- [ ] CRE workflow skeleton (dual handlers)
- [ ] LTV calculation engine

### Phase 2: Integration
- [ ] Polymarket API integration (BFT consensus)
- [ ] Cross-chain read/write (Polygon ↔ Base)
- [ ] Time-weighted order book tracking
- [ ] Liquidation mechanism

### Phase 3: Testing & Deployment
- [ ] Contract test suite (Foundry)
- [ ] CRE workflow simulation
- [ ] Testnet deployment (Mumbai + Base Sepolia)
- [ ] End-to-end integration tests

### Phase 4: Production
- [ ] Mainnet deployment
- [ ] Monitoring dashboard
- [ ] Keeper network integration
- [ ] Security audit

## Contributing

This is a hackathon project for the Chainlink Prediction Markets track. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

MIT - See [LICENSE](./LICENSE)

---

**Built with ❤️ by Team Cyph for the Chainlink Hackathon**
