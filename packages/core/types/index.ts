// Shared type definitions for Vektar
// Re-exports types that are used across packages

export interface Market {
  tokenId: string;
  spotPrice: number;
  active: boolean;
}

export interface UserPosition {
  user: string;
  tokenId: bigint;
  collateralAmount: bigint;
  debtAmount: bigint;
  healthFactor: number;
}

export interface ChainConfig {
  chainSelectorName: string;
  isTestnet?: boolean;
  gasLimit: string;
}
