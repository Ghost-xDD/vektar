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

const getClient = (runtime: Runtime<Config>, chainSelectorName: string, isTestnet?: boolean) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName,
    isTestnet: isTestnet || false,
  });
  if (!network) {
    throw new Error(`Network not found: ${chainSelectorName}`);
  }
  return new cre.capabilities.EVMClient(network.chainSelector.selector);
};

export const settleLoanOnBase = (
  runtime: Runtime<Config>,
  user: string,
  tokenId: string,
  outcome: number,
  netSettlement: bigint
): string => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    runtime.log("[SETTLEMENT] Placeholder vault address configured; skipping settleLoan write");
    return "0x";
  }

  // Must be selector-prefixed so the receiver's onReport router can dispatch.
  const reportData = encodeFunctionData({
    abi: parseAbi(["function settleLoan(address user, uint256 tokenId, uint8 outcome, int256 netSettlement, bytes proof)"]),
    functionName: "settleLoan",
    args: [user as `0x${string}`, BigInt(tokenId), outcome, netSettlement, "0x"],
  });

  const report = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const evmClient = getClient(runtime, runtime.config.base.chainSelectorName, runtime.config.base.isTestnet);
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: vaultAddress,
      report,
      gasConfig: {
        gasLimit: runtime.config.base.gasLimit,
      },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`settleLoanOnBase write failed with txStatus=${writeResult.txStatus}. txHash=${txHash}`);
  }
  return txHash;
};

export const releaseCollateralOnPolygon = (
  runtime: Runtime<Config>,
  user: string,
  tokenId: string,
  outcome: number
): string => {
  const escrowAddress = runtime.config.polygon.escrowAddress;
  if (isPlaceholderAddress(escrowAddress)) {
    runtime.log("[SETTLEMENT] Placeholder escrow address configured; skipping releaseOnSettlement write");
    return "0x";
  }

  // Must be selector-prefixed so the receiver's onReport router can dispatch.
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

  const evmClient = getClient(runtime, runtime.config.polygon.chainSelectorName, runtime.config.polygon.isTestnet);
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: escrowAddress,
      report,
      gasConfig: {
        gasLimit: runtime.config.polygon.gasLimit,
      },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`releaseCollateralOnPolygon write failed with txStatus=${writeResult.txStatus}. txHash=${txHash}`);
  }
  return txHash;
};
