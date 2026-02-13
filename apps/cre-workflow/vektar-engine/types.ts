// types.ts
// Type definitions and Zod schemas for Vektar CRE workflow

import { z } from "zod";

/**************************************************
 * Configuration Schemas
 **************************************************/

// Polygon configuration (collateral layer)
const polygonConfigSchema = z.object({
  chainSelectorName: z.string().min(1),
  isTestnet: z.boolean().optional(),
  escrowAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "Must be valid Ethereum address"),
  umaOracleAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "Must be valid Ethereum address"),
  gasLimit: z.string().regex(/^\d+$/).refine(val => Number(val) > 0),
});

// Base configuration (settlement layer)
const baseConfigSchema = z.object({
  chainSelectorName: z.string().min(1),
  isTestnet: z.boolean().optional(),
  vaultAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "Must be valid Ethereum address"),
  gasLimit: z.string().regex(/^\d+$/).refine(val => Number(val) > 0),
});

// Polymarket API configuration
const polymarketConfigSchema = z.object({
  // Avoid runtime-specific URL parser differences by validating protocol explicitly.
  apiUrl: z
    .string()
    .min(1)
    .refine((val) => /^https?:\/\//.test(val), "apiUrl must start with http:// or https://"),
  cacheMaxAgeMs: z.number().int().min(0),
});

// Dynamic LTV parameters
const ltvConfigSchema = z.object({
  baseLTV: z.number().min(0).max(1), // e.g., 0.75 = 75%
  safetyMargin: z.number().min(0).max(1), // e.g., 0.9 = 90%
  maxLTVIncreasePerCycle: z.number().min(0), // e.g., 0.02 = 2%
  liquidationThreshold: z.number().min(0), // e.g., 1.0 = 100%
  twobWindow: z.number().int().min(1), // Time-Weighted Order Book window (num cycles)
});

// Active market configuration
const marketConfigSchema = z.object({
  tokenId: z.string(),
  spotPrice: z.number().positive(),
});

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "Must be valid Ethereum address");

// Main workflow configuration schema
export const configSchema = z.object({
  polygon: polygonConfigSchema,
  base: baseConfigSchema,
  polymarket: polymarketConfigSchema,
  ltv: ltvConfigSchema,
  activeMarkets: z.array(marketConfigSchema).min(1),
  watchedUsers: z.array(addressSchema),
  assertionToTokenMap: z.record(z.string(), z.string()).optional(),
});

export type Config = z.infer<typeof configSchema>;

/**************************************************
 * Polymarket API Types
 **************************************************/

export interface OrderBookBid {
  price: number;
  size: number;
}

export interface OrderBookAsk {
  price: number;
  size: number;
}

export interface PolymarketCLOBResponse {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: number;
}

export interface OrderBookResponse {
  tokenId: string;
  bids: OrderBookBid[];
  asks: OrderBookAsk[];
  timestamp: number;
}

/**************************************************
 * Dynamic LTV Types
 **************************************************/

export interface LTVCalculationResult {
  dynamicLTV: number; // In basis points (0-10000)
  vwap: number;
  slippageFactor: number;
  exitLiquidity: number;
}

export interface OrderBookSnapshot {
  tokenId: string;
  bids: OrderBookBid[];
  totalBidDepth: number;
  timestamp: number;
}

/**************************************************
 * Position Types
 **************************************************/

export interface Position {
  user: string;
  tokenId: bigint;
  collateralAmount: bigint;
  debtAmount: bigint;
  healthFactor: number;
  liquidatable?: boolean;
}

/**************************************************
 * Settlement Types
 **************************************************/

export interface SettlementData {
  user: string;
  tokenId: bigint;
  outcome: number; // 0 = No, 1 = Yes
  netSettlement: bigint;
}
