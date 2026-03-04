// Handler 1: Continuous settlement oracle (triggered every 12 seconds)
// Fetches Polymarket order book, calculates VWAP exit value, writes settlementValueUSDC to Base.

import { type Runtime } from "@chainlink/cre-sdk";
import type { Config } from "../types";
import { calculateLiquidityAdjustedLTV } from "../../../../packages/core/ltv-engine/calculate-ltv";
import { getTimeWeightedLiquidity, calculateTotalBidDepth } from "../../../../packages/core/ltv-engine/twob-tracker";
import { getTotalLockedCollateral } from "../integrations/collateral-reader";
import { updateSettlementValue } from "../integrations/settlement-oracle-writer";
import { fetchMergedOrderBook } from "../integrations/polymarket";

/**
 * Settlement oracle handler — runs every 12 seconds via cron trigger.
 *
 * Flow:
 * 1. Iterate over active markets
 * 2. Fetch Polymarket order book with BFT consensus (ConfidentialHTTP hides token_id)
 * 3. Read locked collateral from Polygon CollateralEscrow
 * 4. Simulate a market sell via VWAP against live bid depth
 * 5. Apply 10% safety margin → settlementValueUSDC
 * 6. Write signed oracle report to SettlementVault on Base
 *
 * Settlement value = what the position would actually clear for right now, not the mark price.
 */
export const monitorLiquidity = async (runtime: Runtime<Config>): Promise<string> => {
  try {
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("[TRIGGER] Cron fired: */12 * * * * *");
    runtime.log("[ORACLE]  Settlement oracle cycle started");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const markets = runtime.config.activeMarkets;

    if (markets.length === 0) {
      runtime.log("[ORACLE] No active markets configured");
      return "No active markets";
    }

    runtime.log(`[ORACLE] Processing ${markets.length} market(s)`);

    for (const market of markets) {
      const shortToken = market.tokenId.substring(0, 20) + "...";
      runtime.log(`[ORACLE] Market: ${shortToken}`);
      runtime.log(`[HTTP]   Fetching Polymarket order book (via Confidential HTTP — token_id hidden)...`);

      const orderBook = fetchMergedOrderBook(runtime, market.tokenId, market.noTokenId);
      const totalBidDepth = calculateTotalBidDepth(orderBook.bids);
      const twobLiquidity = getTimeWeightedLiquidity(
        market.tokenId,
        {
          tokenId: market.tokenId,
          bids: orderBook.bids,
          totalBidDepth,
          timestamp: orderBook.timestamp,
        },
        runtime.config.ltv.twobWindow
      );
      runtime.log(`[ORACLE] TWOB min liquidity: $${twobLiquidity.toFixed(2)} (over ${runtime.config.ltv.twobWindow} cycles)`);

      runtime.log(`[EVM READ] Polygon → getTotalLocked() for market...`);
      let totalLocked = getTotalLockedCollateral(runtime, market.tokenId);
      if (totalLocked <= 0n) {
        runtime.log(`[ORACLE] No locked collateral for ${shortToken}, using 1e18 for demo`);
        totalLocked = 1000000000000000000n;
      }

      // Reuse the LTV engine — the VWAP output is the same signal we need.
      // settlementValueUSDC = VWAP × shares × safetyMargin (expressed in USDC 6 decimals)
      const ltvResult = calculateLiquidityAdjustedLTV(
        { bids: orderBook.bids },
        totalLocked,
        market.spotPrice,
        {
          baseLTV: runtime.config.ltv.baseLTV,
          safetyMargin: runtime.config.ltv.safetyMargin,
          maxLTVIncreasePerCycle: runtime.config.ltv.maxLTVIncreasePerCycle,
          liquidationThreshold: runtime.config.ltv.liquidationThreshold,
        }
      );

      // Exit value = VWAP × total bid depth (USDC 6 decimals), with safety margin applied
      const calculatedExitValue = ltvResult.vwap * totalBidDepth * runtime.config.ltv.safetyMargin;
      const settlementValueUSDC = Math.max(0, Math.floor(calculatedExitValue * 1_000_000));

      runtime.log(`[COMPUTE] VWAP:              $${ltvResult.vwap.toFixed(4)}/share`);
      runtime.log(`[COMPUTE] Bid depth:         $${totalBidDepth.toFixed(2)}`);
      runtime.log(`[COMPUTE] Safety margin:     ${(runtime.config.ltv.safetyMargin * 100).toFixed(0)}%`);
      runtime.log(`[COMPUTE] Settlement value:  $${(settlementValueUSDC / 1_000_000).toFixed(2)} USDC`);
      runtime.log(`[COMPUTE] (spot price says:  $${(market.spotPrice * Number(totalLocked) / 1e18).toFixed(2)} — liquidity illusion gap)`);

      runtime.log(`[EVM WRITE] Base → SettlementVault.updateSettlementValue(${settlementValueUSDC})`);
      const txHash = updateSettlementValue(runtime, market.tokenId, settlementValueUSDC);
      runtime.log(`[TX]       ✓ ${txHash}`);
    }

    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("[ORACLE] ✅ Settlement oracle cycle completed");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return "Settlement oracle cycle complete";

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] monitorLiquidity: ${msg}`);
    throw err;
  }
};
