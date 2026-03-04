// Handler 2: Event-driven final settlement (triggered on UMA QuestionResolved)
// Decodes the resolution event, then calls settlePosition on Base and releases collateral on Polygon.

import { type Runtime, type EVMLog, bytesToHex } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import type { Config } from "../types";
import { settlePositionOnBase, releaseCollateralOnPolygon } from "../integrations/settlement-oracle-writer";

const umaEventAbi = parseAbi([
  "event QuestionResolved(bytes32 indexed questionID, int256 settledPrice, uint256[] payouts)"
]);

/**
 * Settle-position handler — fired by UMA CTF Adapter QuestionResolved event on Polygon.
 *
 * Flow:
 * 1. Decode QuestionResolved event (questionID, settledPrice, payouts)
 * 2. Map questionID → Polymarket tokenId (from assertionToTokenMap in config)
 * 3. Write settlePosition to SettlementVault on Base (pool redemption logic)
 * 4. Write releaseOnSettlement to CollateralEscrow on Polygon (unlock CTF shares)
 *
 * Uses real historical QuestionResolved tx hashes for simulation:
 *   cre workflow simulate vektar-engine --trigger-index 1 --evm-tx-hash <REAL_TX_HASH>
 */
export const settlePosition = (runtime: Runtime<Config>, log: EVMLog): string => {
  try {
    runtime.log("[SETTLEMENT] ─────────────────────────────────────");
    runtime.log("[SETTLEMENT] Market resolution event detected");
    runtime.log("[SETTLEMENT] ─────────────────────────────────────");

    const topics = log.topics.map(t => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]];
    const data = bytesToHex(log.data);

    const decoded = decodeEventLog({
      abi: umaEventAbi,
      data,
      topics,
    });

    const questionID = decoded.args.questionID as `0x${string}`;
    const settledPrice = decoded.args.settledPrice as bigint;
    const payouts = decoded.args.payouts as bigint[];

    // settledPrice encodes the outcome:
    //   1e18  = YES wins  (payouts [1,0])
    //   0     = NO wins   (payouts [0,1])
    //   5e17  = INVALID   (payouts [1,1])
    let outcome = 0;
    if (settledPrice === BigInt("1000000000000000000")) {
      outcome = 1;
    } else if (settledPrice === BigInt("500000000000000000")) {
      outcome = 2; // INVALID — pool absorbs loss
    }

    runtime.log(`[SETTLEMENT] questionID:    ${questionID}`);
    runtime.log(`[SETTLEMENT] settledPrice:  ${settledPrice}`);
    runtime.log(`[SETTLEMENT] outcome:       ${outcome === 1 ? "YES ✓" : outcome === 2 ? "INVALID" : "NO ✗"}`);
    runtime.log(`[SETTLEMENT] payouts:       [${payouts.join(", ")}]`);

    // Resolve questionID → tokenId via the config mapping (or fall back to the first active market)
    const mappedTokenId =
      runtime.config.assertionToTokenMap?.[questionID.toLowerCase()] ??
      runtime.config.activeMarkets[0]?.tokenId;

    if (!mappedTokenId) {
      throw new Error(
        "No tokenId found for resolved questionID — check assertionToTokenMap in config.json"
      );
    }
    runtime.log(`[SETTLEMENT] tokenId:       ${mappedTokenId.substring(0, 20)}...`);

    if (runtime.config.watchedUsers.length === 0) {
      runtime.log("[SETTLEMENT] No watchedUsers configured; skipping position settlement");
      return "Settlement complete (no users)";
    }

    for (const user of runtime.config.watchedUsers) {
      runtime.log(`[SETTLEMENT] Settling position for user: ${user.substring(0, 8)}...`);

      runtime.log(`[EVM WRITE] Base → SettlementVault.settlePosition(${user}, ..., ${outcome})`);
      const baseTx = settlePositionOnBase(runtime, user, mappedTokenId, outcome);
      runtime.log(`[TX]        ✓ ${baseTx}`);

      runtime.log(`[EVM WRITE] Polygon → CollateralEscrow.releaseOnSettlement(${user}, ..., ${outcome})`);
      const polygonTx = releaseCollateralOnPolygon(runtime, user, mappedTokenId, outcome);
      runtime.log(`[TX]        ✓ ${polygonTx}`);
    }

    runtime.log("[SETTLEMENT] ─────────────────────────────────────");
    runtime.log("[SETTLEMENT] ✅ Final settlement complete");
    runtime.log("[SETTLEMENT] ─────────────────────────────────────");
    return "Settlement complete";

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] settlePosition: ${msg}`);
    throw err;
  }
};
