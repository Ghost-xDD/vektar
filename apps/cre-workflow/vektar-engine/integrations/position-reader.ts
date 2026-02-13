import { bytesToHex, cre, getNetwork, hexToBase64, type Runtime } from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";
import type { Config } from "../types";

const vaultAbi = parseAbi([
  "function positions(address user, uint256 tokenId) view returns (uint256 tokenIdValue, uint256 collateralAmount, uint256 debtAmount, uint256 lastLTVUpdate, bool liquidatable, uint256 liquidatableTimestamp, address polygonAddress)",
  "function markets(uint256 tokenId) view returns (uint256 currentLTV, uint256 lastUpdate, uint256 totalCollateral, bool active)",
  "function getActiveMarkets() view returns (uint256[])",
]);

export interface OnchainPosition {
  tokenIdValue: bigint;
  collateralAmount: bigint;
  debtAmount: bigint;
  liquidatable: boolean;
}

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

export const getPosition = (runtime: Runtime<Config>, user: string, tokenId: string): OnchainPosition => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    return { tokenIdValue: 0n, collateralAmount: 0n, debtAmount: 0n, liquidatable: false };
  }

  const callData = encodeFunctionData({
    abi: vaultAbi,
    functionName: "positions",
    args: [user as `0x${string}`, BigInt(tokenId)],
  });

  const evmClient = getBaseClient(runtime);
  const result = evmClient
    .callContract(runtime, {
      call: {
        to: hexToBase64(vaultAddress),
        data: hexToBase64(callData),
      },
    })
    .result();

  const decoded = decodeFunctionResult({
    abi: vaultAbi,
    functionName: "positions",
    data: bytesToHex(result.data),
  }) as readonly [bigint, bigint, bigint, bigint, boolean, bigint, `0x${string}`];

  return {
    tokenIdValue: decoded[0],
    collateralAmount: decoded[1],
    debtAmount: decoded[2],
    liquidatable: decoded[4],
  };
};

export const getMarketLTVBps = (runtime: Runtime<Config>, tokenId: string): bigint => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    return 0n;
  }

  const callData = encodeFunctionData({
    abi: vaultAbi,
    functionName: "markets",
    args: [BigInt(tokenId)],
  });

  const evmClient = getBaseClient(runtime);
  const result = evmClient
    .callContract(runtime, {
      call: {
        to: hexToBase64(vaultAddress),
        data: hexToBase64(callData),
      },
    })
    .result();

  const decoded = decodeFunctionResult({
    abi: vaultAbi,
    functionName: "markets",
    data: bytesToHex(result.data),
  }) as readonly [bigint, bigint, bigint, boolean];

  return decoded[0];
};

export const getActiveMarketIds = (runtime: Runtime<Config>): bigint[] => {
  const vaultAddress = runtime.config.base.vaultAddress;
  if (isPlaceholderAddress(vaultAddress)) {
    return [];
  }

  const callData = encodeFunctionData({
    abi: vaultAbi,
    functionName: "getActiveMarkets",
    args: [],
  });

  const evmClient = getBaseClient(runtime);
  const result = evmClient
    .callContract(runtime, {
      call: {
        to: hexToBase64(vaultAddress),
        data: hexToBase64(callData),
      },
    })
    .result();

  return decodeFunctionResult({
    abi: vaultAbi,
    functionName: "getActiveMarkets",
    data: bytesToHex(result.data),
  }) as bigint[];
};
