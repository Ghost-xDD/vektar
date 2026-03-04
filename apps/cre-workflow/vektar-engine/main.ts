// Entry point for the Vektar CRE workflow — Settlement Oracle Engine
// Three-handler pattern:
//   Handler 1: Cron (every 12s) — write settlementValueUSDC to SettlementVault
//   Handler 2: EVM Log (UMA QuestionResolved) — final settlement + collateral release
//   Handler 3: EVM Log (EarlyExitExecuted) — private payout via Convergence vault

import { cre, Runner, getNetwork, hexToBase64 } from "@chainlink/cre-sdk";
import { keccak256, toBytes } from "viem";
import { configSchema, type Config } from "./types";

import { monitorLiquidity } from "./handlers/monitor-liquidity";
import { settlePosition } from "./handlers/settle-position";
import { privatePayout } from "./handlers/private-payout";

// UMA CTF Adapter: fires when a Polymarket market resolves
const QUESTION_RESOLVED_SIG = "QuestionResolved(bytes32,int256,uint256[])";

// SettlementVault: fires when a user calls earlyExit()
const EARLY_EXIT_EXECUTED_SIG = "EarlyExitExecuted(address,uint256,uint256)";

/**
 * Initializes the Vektar CRE workflow with three handlers.
 *
 * Handler 1 — Settlement oracle (cron, every 12s):
 *   Fetches Polymarket CLOB order book via Confidential HTTP (query is private).
 *   Runs VWAP simulation with TWOB anti-manipulation.
 *   Writes settlementValueUSDC to SettlementVault on Base.
 *
 * Handler 2 — Final settlement (EVM log: QuestionResolved on Polygon):
 *   Decodes UMA resolution event.
 *   Writes settlePosition to SettlementVault on Base.
 *   Releases CTF shares from CollateralEscrow on Polygon.
 *
 * Handler 3 — Private payout (EVM log: EarlyExitExecuted on Base):
 *   Reads user's shielded address from SettlementVault.
 *   Routes payout to shielded address via Convergence private vault API.
 *   Uses VAULT_OPERATOR_KEY from CRE secrets — never in code or on-chain.
 */
const initWorkflow = (config: Config) => {
  const cronTrigger = new cre.capabilities.CronCapability();

  const polygonNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.polygon.chainSelectorName,
    isTestnet: config.polygon.isTestnet || false,
  });
  if (!polygonNetwork) {
    throw new Error(`Polygon network not found: ${config.polygon.chainSelectorName}`);
  }

  const baseNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.base.chainSelectorName,
    isTestnet: config.base.isTestnet || false,
  });
  if (!baseNetwork) {
    throw new Error(`Base network not found: ${config.base.chainSelectorName}`);
  }

  const polygonEVM = new cre.capabilities.EVMClient(polygonNetwork.chainSelector.selector);
  const baseEVM = new cre.capabilities.EVMClient(baseNetwork.chainSelector.selector);

  const questionResolvedHash = keccak256(toBytes(QUESTION_RESOLVED_SIG));
  const earlyExitExecutedHash = keccak256(toBytes(EARLY_EXIT_EXECUTED_SIG));

  return [
    // Handler 1: Settlement oracle — every 12 seconds
    cre.handler(
      cronTrigger.trigger({ schedule: "*/12 * * * * *" }),
      monitorLiquidity
    ),

    // Handler 2: Final settlement — UMA resolves a Polymarket market
    cre.handler(
      polygonEVM.logTrigger({
        addresses: [hexToBase64(config.polygon.umaCtfAdapterAddress)],
        topics: [{ values: [hexToBase64(questionResolvedHash)] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      settlePosition
    ),

    // Handler 3: Private payout — user called earlyExit() on Base
    cre.handler(
      baseEVM.logTrigger({
        addresses: [hexToBase64(config.base.vaultAddress)],
        topics: [{ values: [hexToBase64(earlyExitExecutedHash)] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      privatePayout
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
