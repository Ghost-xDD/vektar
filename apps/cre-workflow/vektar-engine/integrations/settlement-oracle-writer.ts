// settlement-oracle-writer.ts
// Writes CRE-signed reports to SettlementVault on Base.

import { bytesToHex, cre, getNetwork, hexToBase64, TxStatus, type Runtime } from "@chainlink/cre-sdk";
import { encodeFunctionData, parseAbi } from "viem";
import type { Config } from "../types";

const isPlaceholderAddress = (address: string): boolean => {
  try {
    return BigInt(address) <= 0x1000n;
  } catch {
    return false;
  }
};

const getBaseClient = (runtime: Runtime<Config>) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.base.chainSelectorName,
    isTestnet: runtime.config.base.isTestnet || false,
  });
  if (!network) {
    throw new Error(`Base network not found: ${runtime.config.base.chainSelectorName}`);
  }
  return new cre.capabilities.EVMClient(network.chainSelector.selector);
};

const getPolygonClient = (runtime: Runtime<Config>) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.polygon.chainSelectorName,
    isTestnet: runtime.config.polygon.isTestnet || false,
  });
  if (!network) {
    throw new Error(`Polygon network not found: ${runtime.config.polygon.chainSelectorName}`);
  }
  return new cre.capabilities.EVMClient(network.chainSelector.selector);
};

/// @notice Write a CRE-signed updateSettlementValue report to SettlementVault on Base.
/// @param tokenId  Polymarket CTF token ID (string — BigInt safe)
/// @param settlementValueUSDC  Settlement value in USDC 6-decimal integer
export const updateSettlementValue = (
  runtime: Runtime<Config>,
  tokenId: string,
  settlementValueUSDC: number
): string => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    runtime.log("[ORACLE] Placeholder vault address; skipping updateSettlementValue write");
    return "0x";
  }

  const reportData = encodeFunctionData({
    abi: parseAbi(["function updateSettlementValue(uint256 tokenId, uint256 newValue)"]),
    functionName: "updateSettlementValue",
    args: [BigInt(tokenId), BigInt(settlementValueUSDC)],
  });

  const report = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const evmClient = getBaseClient(runtime);
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: vaultAddress,
      report,
      gasConfig: { gasLimit: runtime.config.base.gasLimit },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `updateSettlementValue write failed: txStatus=${writeResult.txStatus} txHash=${txHash}`
    );
  }
  return txHash;
};

/// @notice Write a CRE-signed settlePosition report to SettlementVault on Base.
/// @param user    Pool address holding the early-exited position shares
/// @param tokenId Polymarket CTF token ID
/// @param outcome 1 = YES, 0 = NO
export const settlePositionOnBase = (
  runtime: Runtime<Config>,
  user: string,
  tokenId: string,
  outcome: number
): string => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    runtime.log("[SETTLEMENT] Placeholder vault address; skipping settlePosition write");
    return "0x";
  }

  const reportData = encodeFunctionData({
    abi: parseAbi(["function settlePosition(address user, uint256 tokenId, uint8 outcome)"]),
    functionName: "settlePosition",
    args: [user as `0x${string}`, BigInt(tokenId), outcome],
  });

  const report = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const evmClient = getBaseClient(runtime);
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: vaultAddress,
      report,
      gasConfig: { gasLimit: runtime.config.base.gasLimit },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `settlePositionOnBase write failed: txStatus=${writeResult.txStatus} txHash=${txHash}`
    );
  }
  return txHash;
};

/// @notice Write a CRE-signed releaseOnSettlement report to CollateralEscrow on Polygon.
///         Called after final settlement to release locked CTF shares back to the pool.
export const releaseCollateralOnPolygon = (
  runtime: Runtime<Config>,
  user: string,
  tokenId: string,
  outcome: number
): string => {
  const escrowAddress = runtime.config.polygon.escrowAddress;
  if (isPlaceholderAddress(escrowAddress)) {
    runtime.log("[SETTLEMENT] Placeholder escrow address; skipping releaseOnSettlement write");
    return "0x";
  }

  const reportData = encodeFunctionData({
    abi: parseAbi(["function releaseOnSettlement(address user, uint256 tokenId, uint8 outcome)"]),
    functionName: "releaseOnSettlement",
    args: [user as `0x${string}`, BigInt(tokenId), outcome],
  });

  const report = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const evmClient = getPolygonClient(runtime);
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: escrowAddress,
      report,
      gasConfig: { gasLimit: runtime.config.polygon.gasLimit },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `releaseCollateralOnPolygon write failed: txStatus=${writeResult.txStatus} txHash=${txHash}`
    );
  }
  return txHash;
};
