// Core Dynamic LTV calculation engine
// Simulates selling into order book to determine real exit liquidity

export interface OrderBookBid {
  price: number;
  size: number;
}

export interface LTVConfig {
  baseLTV: number;
  safetyMargin: number;
  maxLTVIncreasePerCycle: number;
  liquidationThreshold: number;
}

export interface LTVResult {
  dynamicLTV: number; // Final LTV (0-1)
  vwap: number; // Volume-weighted average price
  slippageFactor: number; // vwap / spotPrice
  exitLiquidity: number; // Total value if selling all collateral
}

/**
 * Calculate liquidity-adjusted Dynamic LTV
 *
 * This is the core innovation of Vektar:
 * Instead of using static LTV based on price, we calculate LTV dynamically
 * based on actual exit liquidity by simulating a market sell.
 *
 * Formula: dynamicLTV = baseLTV × slippageFactor × safetyMargin
 * Where: slippageFactor = (VWAP after slippage) / spotPrice
 *
 * @param orderBook - Current order book bids (sorted by price descending)
 * @param collateralSize - Amount of collateral to simulate selling
 * @param spotPrice - Current market price
 * @param config - LTV configuration parameters
 * @returns LTV calculation result with metrics
 */
export function calculateLiquidityAdjustedLTV(
  orderBook: { bids: OrderBookBid[] },
  collateralSize: bigint,
  spotPrice: number,
  config: LTVConfig,
): LTVResult {
  // Step 1: Convert collateral from wei (1e18) to whole tokens
  // ERC-1155 shares have 18 decimals, but order book sizes are in whole tokens
  const collateralTokens = Number(collateralSize) / 1e18;

  // Debug: Log conversion (remove after testing)
  if (typeof console !== 'undefined') {
    console.log(
      `[LTV-ENGINE] Collateral: ${collateralSize.toString()} wei = ${collateralTokens} tokens`,
    );
    console.log(
      `[LTV-ENGINE] Order book depth: ${orderBook.bids.length} levels`,
    );
  }

  // Step 2: Simulate selling collateral into the order book
  let remainingSize = collateralTokens;
  let totalValue = 0;

  for (const bid of orderBook.bids) {
    if (remainingSize <= 0) break;

    const fillSize = Math.min(remainingSize, bid.size);
    totalValue += fillSize * bid.price;
    remainingSize -= fillSize;
  }

  // Step 2: If can't fill entire order, liquidity is insufficient
  if (remainingSize > 0) {
    return {
      dynamicLTV: 0, // Zero LTV — cannot safely lend
      vwap: 0,
      slippageFactor: 0,
      exitLiquidity: totalValue,
    };
  }

  // Step 3: Calculate VWAP and slippage factor
  const vwap = totalValue / collateralTokens;
  const slippageFactor = vwap / spotPrice;

  // Step 4: Apply formula with safety margin
  const dynamicLTV = config.baseLTV * slippageFactor * config.safetyMargin;

  // Step 5: Cap at base LTV (can't exceed maximum)
  const finalLTV = Math.max(0, Math.min(dynamicLTV, config.baseLTV));

  return {
    dynamicLTV: finalLTV,
    vwap,
    slippageFactor,
    exitLiquidity: totalValue,
  };
}

/**
 * Calculate health factor for a position
 * Health factor = (collateralValue × currentLTV) / debt
 *
 * - healthFactor > 1.0: Position is safe
 * - healthFactor < 1.0: Position is underwater (liquidatable)
 *
 * @param collateralValue - Current value of collateral
 * @param currentLTV - Dynamic LTV from latest calculation
 * @param debtAmount - Outstanding debt
 * @returns Health factor (1.0 = exactly at liquidation threshold)
 */
export function calculateHealthFactor(
  collateralValue: number,
  currentLTV: number,
  debtAmount: number,
): number {
  if (debtAmount === 0) return Infinity;

  const maxBorrow = collateralValue * currentLTV;
  return maxBorrow / debtAmount;
}
