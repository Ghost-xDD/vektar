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

export const updateMarketLTV = (runtime: Runtime<Config>, tokenId: string, newLTVBps: number): string => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    runtime.log("[LTV] Placeholder vault address configured; skipping updateMarketLTV write");
    return "0x";
  }

  const reportData = encodeFunctionData({
    abi: parseAbi(["function updateMarketLTV(uint256 tokenId, uint256 newLTV, bytes proof)"]),
    functionName: "updateMarketLTV",
    args: [BigInt(tokenId), BigInt(newLTVBps), "0x"],
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
      gasConfig: {
        gasLimit: runtime.config.base.gasLimit,
      },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`updateMarketLTV write failed with txStatus=${writeResult.txStatus}. txHash=${txHash}`);
  }
  return txHash;
};

export const markLiquidatable = (runtime: Runtime<Config>, user: string, tokenId: string): string => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    runtime.log("[LTV] Placeholder vault address configured; skipping markLiquidatable write");
    return "0x";
  }

  const reportData = encodeFunctionData({
    abi: parseAbi(["function markLiquidatable(address user, uint256 tokenId, bytes proof)"]),
    functionName: "markLiquidatable",
    args: [user as `0x${string}`, BigInt(tokenId), "0x"],
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
      gasConfig: {
        gasLimit: runtime.config.base.gasLimit,
      },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`markLiquidatable write failed with txStatus=${writeResult.txStatus}. txHash=${txHash}`);
  }
  return txHash;
};
