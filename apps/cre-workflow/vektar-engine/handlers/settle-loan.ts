// settle-loan.ts
// Handler 2: Event-driven settlement (triggered when UMA resolves markets)
// Calculates final settlement, executes cross-chain payouts

import { type Runtime, type EVMLog, bytesToHex } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import type { Config } from "../types";
import { getPosition } from "../integrations/position-reader";
import { releaseCollateralOnPolygon, settleLoanOnBase } from "../integrations/settlement-writer";

const umaEventAbi = parseAbi([
  "event AssertionSettled(bytes32 indexed assertionId, address indexed assertionCaller, bool settlementResolution, bool assertedTruthfully, address settleCaller)"
]);

/**
 * Settlement handler - triggered by UMA AssertionSettled event
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
 * @param log - EVM log containing the AssertionSettled event
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
    const settlementResolution = decoded.args.settlementResolution as boolean;
    const outcome = settlementResolution ? 1 : 0; // true = YES wins, false = NO wins
    
    runtime.log(`[SETTLEMENT] AssertionId: ${assertionId}`);
    runtime.log(`[SETTLEMENT] SettlementResolution: ${outcome === 1 ? "YES" : "NO"}`);

    const mappedTokenId =
      runtime.config.assertionToTokenMap?.[assertionId.toLowerCase()] ?? runtime.config.activeMarkets[0]?.tokenId;
    if (!mappedTokenId) {
      throw new Error("No tokenId found for settlement (assertion map empty and no active market configured)");
    }
    runtime.log(`[SETTLEMENT] Using tokenId=${mappedTokenId}`);

    if (runtime.config.watchedUsers.length === 0) {
      runtime.log("[SETTLEMENT] No watchedUsers configured; nothing to settle");
      return "Settlement complete (no users)";
    }

    for (const user of runtime.config.watchedUsers) {
      const pos = getPosition(runtime, user, mappedTokenId);
      if (pos.debtAmount === 0n && pos.collateralAmount === 0n) {
        continue;
      }

      // Simple net settlement baseline:
      // YES: collateral value offsets debt; NO: debt is treated as loss.
      const netSettlement = outcome === 1 ? pos.collateralAmount - pos.debtAmount : -pos.debtAmount;

      const baseTx = settleLoanOnBase(runtime, user, mappedTokenId, outcome, netSettlement);
      runtime.log(`[SETTLEMENT] settleLoanOnBase user=${user} txHash=${baseTx}`);

      const polygonTx = releaseCollateralOnPolygon(runtime, user, mappedTokenId, outcome);
      runtime.log(`[SETTLEMENT] releaseCollateralOnPolygon user=${user} txHash=${polygonTx}`);
    }
    
    runtime.log("[SETTLEMENT] Settlement processing complete");
    return "Settlement complete";
    
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] settleLoan: ${msg}`);
    throw err;
  }
};
