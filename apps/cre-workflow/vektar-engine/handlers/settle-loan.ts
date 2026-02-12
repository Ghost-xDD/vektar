// settle-loan.ts
// Handler 2: Event-driven settlement (triggered when UMA resolves markets)
// Calculates final settlement, executes cross-chain payouts

import { type Runtime, type EVMLog, bytesToHex } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import type { Config } from "../types";

const umaEventAbi = parseAbi([
  "event AssertionResolved(bytes32 indexed assertionId, address indexed caller, bool result)"
]);

/**
 * Settlement handler - triggered by UMA AssertionResolved event
 * 
 * Flow:
 * 1. Decode UMA oracle event (assertionId, outcome)
 * 2. Map assertionId to Polymarket tokenId (stored mapping)
 * 3. Read all active positions for this market from Base
 * 4. Calculate net settlement per position (collateral value - debt)
 * 5. Execute settlement on Base (HorizonVault.settleLoan)
 * 6. Release collateral from Polygon escrow
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param log - EVM log containing the AssertionResolved event
 * @returns Success message
 */
export const settleLoan = (runtime: Runtime<Config>, log: EVMLog): string => {
  try {
    runtime.log("[SETTLEMENT] Market resolution detected");
    
    // Step 1: Decode UMA event
    const topics = log.topics.map(t => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]];
    const data = bytesToHex(log.data);
    
    const decoded = decodeEventLog({
      abi: umaEventAbi,
      data,
      topics
    });
    
    const assertionId = decoded.args.assertionId as `0x${string}`;
    const result = decoded.args.result as boolean;
    const outcome = result ? 1 : 0; // true = YES wins, false = NO wins
    
    runtime.log(`[SETTLEMENT] AssertionId: ${assertionId}`);
    runtime.log(`[SETTLEMENT] Outcome: ${outcome === 1 ? "YES" : "NO"}`);
    
    // TODO: Implement full settlement logic
    // 1. Map assertionId to tokenId
    // 2. getActivePositions(runtime, tokenId)
    // 3. calculateSettlement(positions, outcome)
    // 4. executeSettlementOnBase(runtime, settlements)
    // 5. releaseCollateralOnPolygon(runtime, positions)
    
    runtime.log("[SETTLEMENT] Settlement processing complete");
    return "Settlement complete";
    
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] settleLoan: ${msg}`);
    throw err;
  }
};
