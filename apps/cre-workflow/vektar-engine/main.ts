// Entry point for the Vektar CRE workflow - Dynamic LTV Engine
// Implements dual-handler pattern: Cron (12s monitoring) + Event Log (UMA settlement)

import { cre, Runner, getNetwork, hexToBase64 } from "@chainlink/cre-sdk";
import { keccak256, toBytes } from "viem";
import { configSchema, type Config } from "./types";

// Import handlers
import { monitorLiquidity } from "./handlers/monitor-liquidity";
import { settleLoan } from "./handlers/settle-loan";

/**************************************************
 * Event ABI Definitions
 **************************************************/

const assertionResolvedSignature = "AssertionResolved(bytes32,address,bool)";

/**************************************************
 * Workflow Initialization
 **************************************************/

/**
 * Initializes the Vektar CRE workflow with dual handlers
 * 
 * Handler 1: Cron trigger (every 12 seconds)
 *  - Fetches Polymarket order book with BFT consensus
 *  - Calculates Dynamic LTV based on exit liquidity
 *  - Updates HorizonVault on Base with cryptographic proofs
 *  - Marks underwater positions for liquidation
 * 
 * Handler 2: EVM Log trigger (event-driven)
 *  - Watches UMA Optimistic Oracle on Polygon
 *  - Triggers when markets resolve (AssertionResolved event)
 *  - Executes final settlement across chains
 *  - Releases collateral from Polygon escrow
 * 
 * @param config - Validated workflow configuration
 * @returns Array of CRE handlers
 */
const initWorkflow = (config: Config) => {
  // Initialize triggers
  const cronTrigger = new cre.capabilities.CronCapability();
  
  // Get Polygon network for UMA event monitoring
  const polygonNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.polygon.chainSelectorName,
    isTestnet: config.polygon.isTestnet || false,
  });
  
  if (!polygonNetwork) {
    throw new Error(`Polygon network not found: ${config.polygon.chainSelectorName}`);
  }
  
  const polygonEVM = new cre.capabilities.EVMClient(polygonNetwork.chainSelector.selector);
  
  // Compute event topic hash for UMA AssertionResolved
  const assertionResolvedHash = keccak256(toBytes(assertionResolvedSignature));
  
  return [
    // Handler 1: Continuous Liquidity Monitoring (every 12 seconds)
    cre.handler(
      cronTrigger.trigger({ schedule: "*/12 * * * * *" }), // Every 12 seconds
      monitorLiquidity
    ),
    
    // Handler 2: Event-Driven Settlement (when UMA resolves markets)
    // Temporarily disabled for testing
    // cre.handler(
    //   polygonEVM.logTrigger({
    //     addresses: [hexToBase64(config.polygon.umaOracleAddress)],
    //     topics: [{ values: [hexToBase64(assertionResolvedHash)] }],
    //     confidence: "CONFIDENCE_LEVEL_FINALIZED", // Wait for finality
    //   }),
    //   settleLoan
    // ),
  ];
};

/**************************************************
 * Entry Point
 **************************************************/

/**
 * Main entry point for the Vektar CRE workflow
 * Initializes the CRE runner and starts the workflow
 */
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
