// settle-loan.ts
// Handler 2: Event-driven settlement (triggered when UMA resolves markets)
// Calculates final settlement, executes cross-chain payouts

import { type Runtime, type EVMLog, bytesToHex } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import type { Config } from "../types";
import { getPosition } from "../integrations/position-reader";
import { releaseCollateralOnPolygon, settleLoanOnBase } from "../integrations/settlement-writer";

const umaEventAbi = parseAbi([
  "event QuestionResolved(bytes32 indexed questionID, int256 settledPrice, uint256[] payouts)"
]);

/**
 * Settlement handler - triggered by UMA CTF Adapter QuestionResolved event
 * 
 * Flow:
 * 1. Decode QuestionResolved event (questionID, settledPrice, payouts)
 * 2. Map questionID to Polymarket tokenId (stored mapping)
 * 3. Read all active positions for this market from Base
 * 4. Calculate net settlement per position (collateral value - debt)
 * 5. Execute settlement on Base (HorizonVault.settleLoan)
 * 6. Release collateral from Polygon escrow
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @param log - EVM log containing the QuestionResolved event
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
    
    const questionID = decoded.args.questionID as `0x${string}`;
    const settledPrice = decoded.args.settledPrice as bigint;
    const payouts = decoded.args.payouts as bigint[];
    
    // Convert settled price to outcome
    // 0 = NO (payouts [0,1]), 1 ether = YES (payouts [1,0]), 0.5 ether = INVALID (payouts [1,1])
    let outcome = 0;
    if (settledPrice === BigInt("1000000000000000000")) {
      outcome = 1; // YES
    } else if (settledPrice === BigInt("500000000000000000")) {
      outcome = 2; // INVALID/TIE
    } // else 0 = NO
    
    runtime.log(`[SETTLEMENT] QuestionID: ${questionID}`);
    runtime.log(`[SETTLEMENT] SettledPrice: ${settledPrice}, Outcome: ${outcome === 1 ? "YES" : outcome === 2 ? "INVALID" : "NO"}`);
    runtime.log(`[SETTLEMENT] Payouts: [${payouts.join(", ")}]`);

    const mappedTokenId =
      runtime.config.assertionToTokenMap?.[questionID.toLowerCase()] ?? runtime.config.activeMarkets[0]?.tokenId;
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
