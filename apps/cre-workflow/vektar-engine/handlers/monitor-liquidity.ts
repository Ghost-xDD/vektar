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
    const demoFallbackShares = runtime.config.demo?.collateralFallbackShares ?? 20_000;
    const demoFallbackCollateralWei = BigInt(demoFallbackShares) * 10n ** 18n;

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
      const scenario = runtime.config.demo?.scenario ?? "normal";
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
        runtime.log(
          `[ORACLE] No locked collateral for ${shortToken}; using demo fallback of ${demoFallbackShares.toLocaleString()} shares in ${scenario} mode`
        );
        totalLocked = demoFallbackCollateralWei;
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

      // Per-share exit price = VWAP × safetyMargin (in USDC, 6 decimals).
      // earlyExit() multiplies this by pos.shares to get the user's total payout.
      // Storing per-share lets getSettlementValue() serve as a public oracle
      // consumable by any external protocol — total-market values are meaningless externally.
      const perShareExitPrice = ltvResult.vwap * runtime.config.ltv.safetyMargin;
      const settlementValueUSDC = Math.max(0, Math.floor(perShareExitPrice * 1_000_000));

      runtime.log(`[COMPUTE] VWAP:              $${ltvResult.vwap.toFixed(4)}/share`);
      runtime.log(`[COMPUTE] Bid depth:         $${totalBidDepth.toFixed(2)} (order book depth — for LTV ref only)`);
      runtime.log(`[COMPUTE] Safety margin:     ${(runtime.config.ltv.safetyMargin * 100).toFixed(0)}%`);
      runtime.log(`[COMPUTE] Per-share price:   $${perShareExitPrice.toFixed(6)}/share`);
      runtime.log(`[COMPUTE] Oracle value:      ${settlementValueUSDC} (USDC 6-dec per share)`);
      runtime.log(`[COMPUTE] Spot price:        $${market.spotPrice.toFixed(4)}/share — oracle is ${((1 - perShareExitPrice / market.spotPrice) * 100).toFixed(1)}% below spot (liquidity discount)`);

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
