// twob-tracker.ts
// Time-Weighted Order Book (TWOB) tracker
// Prevents order book spoofing by averaging liquidity over multiple cycles

import type { OrderBookBid } from "./calculate-ltv";

export interface OrderBookSnapshot {
  tokenId: string;
  bids: OrderBookBid[];
  totalBidDepth: number;
  timestamp: number;
}

// In-memory ring buffer for recent snapshots (per token)
const snapshotBuffers = new Map<string, OrderBookSnapshot[]>();

/**
 * Get time-weighted liquidity for a token
 * 
 * Defense against order book spoofing:
 * - Maintains a sliding window of recent order book snapshots
 * - Returns the MINIMUM liquidity seen in the window (conservative)
 * - Attacker must maintain fake bids for full window duration
 * 
 * @param tokenId - The Polymarket token ID
 * @param currentSnapshot - Current order book snapshot
 * @param windowSize - Number of cycles to average over (default: 5 = 60 seconds)
 * @returns Minimum liquidity seen in time window
 */
export function getTimeWeightedLiquidity(
  tokenId: string,
  currentSnapshot: OrderBookSnapshot,
  windowSize: number = 5
): number {
  // Get or create buffer for this token
  let buffer = snapshotBuffers.get(tokenId);
  if (!buffer) {
    buffer = [];
    snapshotBuffers.set(tokenId, buffer);
  }
  
  // Add current snapshot to buffer
  buffer.push(currentSnapshot);
  
  // Maintain window size (remove oldest if exceeds)
  if (buffer.length > windowSize) {
    buffer.shift();
  }
  
  // Use MINIMUM liquidity seen in window (most conservative)
  const minLiquidity = Math.min(
    ...buffer.map(s => s.totalBidDepth)
  );
  
  return minLiquidity;
}

/**
 * Calculate total bid depth from order book
 * 
 * @param bids - Array of bid orders
 * @returns Total liquidity (sum of all bid sizes)
 */
export function calculateTotalBidDepth(bids: OrderBookBid[]): number {
  return bids.reduce((sum, bid) => sum + bid.size, 0);
}

/**
 * Clear snapshot buffer for a token (useful for testing or market reset)
 * 
 * @param tokenId - The Polymarket token ID
 */
export function clearSnapshotBuffer(tokenId: string): void {
  snapshotBuffers.delete(tokenId);
}
