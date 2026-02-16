// Handler 1: Continuous liquidity monitoring (triggered every 12 seconds)
// Fetches Polymarket order book, calculates Dynamic LTV, updates Base contracts

import { type Runtime } from "@chainlink/cre-sdk";
import type { Config } from "../types";
import { calculateLiquidityAdjustedLTV } from "../../../../packages/core/ltv-engine/calculate-ltv";
import { getTimeWeightedLiquidity, calculateTotalBidDepth } from "../../../../packages/core/ltv-engine/twob-tracker";
import { getTotalLockedCollateral } from "../integrations/collateral-reader";
import { markLiquidatable, updateMarketLTV } from "../integrations/ltv-writer";
import { getPosition } from "../integrations/position-reader";
import { fetchMergedOrderBook } from "../integrations/polymarket";

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
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("[TRIGGER] Cron fired: */12 * * * * *");
    runtime.log("[MONITOR] Liquidity monitoring cycle started");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    const markets = runtime.config.activeMarkets;
    
    if (markets.length === 0) {
      runtime.log("[MONITOR] No active markets configured");
      return "No active markets";
    }
    
    runtime.log(`[MONITOR] Processing ${markets.length} market(s)`);
    
    for (const market of markets) {
      const shortToken = market.tokenId.substring(0, 20) + "...";
      runtime.log(`[MONITOR] Processing market: ${shortToken}`);
      runtime.log(`[HTTP]    Fetching Polymarket order book...`);

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
      runtime.log(`[MONITOR] TWOB min liquidity: ${twobLiquidity} (over ${runtime.config.ltv.twobWindow} cycles)`);

      runtime.log(`[EVM READ] Polygon → getTotalLocked() for market...`);
      let totalLocked = getTotalLockedCollateral(runtime, market.tokenId);
      // For demo/testing: Allow LTV updates even without collateral
      // In production, this check should be enabled
      if (totalLocked <= 0n) {
        runtime.log(`[MONITOR] No locked collateral for ${market.tokenId}, using 1e18 for demo`);
        // Use a default value for testing
        totalLocked = 1000000000000000000n; // 1 token (for demo)
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
      runtime.log(`[COMPUTE]  VWAP simulation: $${ltvResult.vwap.toFixed(2)}`);
      runtime.log(`[COMPUTE]  Slippage factor: ${(ltvResult.slippageFactor * 100).toFixed(1)}%`);
      runtime.log(
        `[COMPUTE]  Dynamic LTV: ${runtime.config.ltv.baseLTV * 100}% × ${ltvResult.slippageFactor.toFixed(2)} × ${runtime.config.ltv.safetyMargin} = ${(dynamicLtvBps / 100).toFixed(1)}%`
      );

      runtime.log(`[EVM WRITE] Base → updateMarketLTV(${dynamicLtvBps} bps)`);
      const txHash = updateMarketLTV(runtime, market.tokenId, dynamicLtvBps);
      runtime.log(`[TX]       ✓ ${txHash}`);

      if (runtime.config.watchedUsers.length === 0) {
        runtime.log("[MONITOR] No watchedUsers configured; skipping liquidation checks");
        continue;
      }

      for (const user of runtime.config.watchedUsers) {
        const pos = getPosition(runtime, user, market.tokenId);
        if (pos.debtAmount === 0n) {
          continue;
        }

        const maxBorrow = (pos.collateralAmount * BigInt(dynamicLtvBps)) / 10000n;
        const healthBps = maxBorrow === 0n ? 0n : (maxBorrow * 10000n) / pos.debtAmount;
        const healthFactor = Number(healthBps) / 10000;

        const shortUser = user.substring(0, 6) + "..." + user.substring(user.length - 4);
        runtime.log(
          `[MONITOR] user=${shortUser} debt=${pos.debtAmount} collateral=${pos.collateralAmount} health=${healthFactor.toFixed(4)}`
        );

        if (healthFactor < runtime.config.ltv.liquidationThreshold) {
          if (pos.liquidatable) {
            runtime.log(`[MONITOR] Position already marked liquidatable (skip)`);
          } else {
            runtime.log(`[MONITOR] ⚠ Health factor < 1.0 — marking position liquidatable`);
            runtime.log(`[EVM WRITE] Base → markLiquidatable(${shortUser}, ...)`);
            try {
              const markTx = markLiquidatable(runtime, user, market.tokenId);
              runtime.log(`[TX]       ✓ ${markTx}`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg.includes("nonce too low") || msg.includes("already known")) {
                runtime.log(`[MONITOR] Position already marked or tx pending (skip)`);
              } else {
                throw err;
              }
            }
          }
        }
      }
    }
    
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log("[MONITOR] ✅ Liquidity monitoring cycle completed");
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return "Liquidity monitoring complete";
    
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] monitorLiquidity: ${msg}`);
    throw err;
  }
};
