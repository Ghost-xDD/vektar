// Handler 1: Continuous liquidity monitoring (triggered every 12 seconds)
// Fetches Polymarket order book, calculates Dynamic LTV, updates Base contracts

import { type Runtime } from "@chainlink/cre-sdk";
import type { Config } from "../types";
import { calculateLiquidityAdjustedLTV } from "../../../../packages/core/ltv-engine/calculate-ltv";
import { getTimeWeightedLiquidity, calculateTotalBidDepth } from "../../../../packages/core/ltv-engine/twob-tracker";
import { getTotalLockedCollateral } from "../integrations/collateral-reader";
import { updateMarketLTV } from "../integrations/ltv-writer";
import { fetchOrderBook } from "../integrations/polymarket";

/**
 * Monitor liquidity handler - runs every 12 seconds via cron trigger
 * 
 * Flow:
 * 1. Iterate over active markets
 * 2. Fetch Polymarket order book with BFT consensus
 * 3. Read locked collateral from Polygon escrow
 * 4. Calculate Dynamic LTV using @vektar/core/ltv-engine
 * 5. Update HorizonVault on Base with cryptographic proof
 * 6. Check for underwater positions and mark for liquidation
 * 
 * @param runtime - CRE runtime instance with config and secrets
 * @returns Success message
 */
export const monitorLiquidity = async (runtime: Runtime<Config>): Promise<string> => {
  try {
    runtime.log("[MONITOR] Liquidity monitoring cycle started");
    
    const markets = runtime.config.activeMarkets;
    
    if (markets.length === 0) {
      runtime.log("[MONITOR] No active markets configured");
      return "No active markets";
    }
    
    runtime.log(`[MONITOR] Processing ${markets.length} market(s)`);
    
    for (const market of markets) {
      runtime.log(`[MONITOR] Processing market: ${market.tokenId}`);

      const orderBook = fetchOrderBook(runtime, market.tokenId);
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
      runtime.log(`[MONITOR] TWOB min liquidity for ${market.tokenId}: ${twobLiquidity}`);

      const totalLocked = getTotalLockedCollateral(runtime, market.tokenId);
      if (totalLocked <= 0n) {
        runtime.log(`[MONITOR] No locked collateral for ${market.tokenId}, skipping LTV update`);
        continue;
      }

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

      const dynamicLtvBps = Math.max(0, Math.min(10000, Math.round(ltvResult.dynamicLTV * 10000)));
      runtime.log(
        `[MONITOR] LTV calc token=${market.tokenId} dynamic=${dynamicLtvBps}bps vwap=${ltvResult.vwap} slippage=${ltvResult.slippageFactor}`
      );

      const txHash = updateMarketLTV(runtime, market.tokenId, dynamicLtvBps);
      runtime.log(`[MONITOR] updateMarketLTV txHash=${txHash}`);

      // TODO: read active positions + health factors and call markLiquidatable for underwater users.
    }
    
    runtime.log("[MONITOR] Liquidity monitoring cycle completed");
    return "Liquidity monitoring complete";
    
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] monitorLiquidity: ${msg}`);
    throw err;
  }
};
