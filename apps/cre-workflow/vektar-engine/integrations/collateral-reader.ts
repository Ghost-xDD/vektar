import { bytesToHex, cre, getNetwork, hexToBase64, type Runtime } from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";
import type { Config } from "../types";

const escrowAbi = parseAbi([
  "function getTotalLocked(uint256 tokenId) view returns (uint256)",
  "function getLockedBalance(address user, uint256 tokenId) view returns (uint256)",
]);

const isPlaceholderAddress = (address: string): boolean => {
  try {
    return BigInt(address) <= 0x1000n;
  } catch {
    return false;
  }
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

export const getTotalLockedCollateral = (runtime: Runtime<Config>, tokenId: string): bigint => {
  const escrow = runtime.config.polygon.escrowAddress;
  if (isPlaceholderAddress(escrow)) {
    runtime.log("[COLLATERAL] Placeholder escrow address configured; returning 0 collateral");
    return 0n;
  }

  const evmClient = getPolygonClient(runtime);
  const callData = encodeFunctionData({
    abi: escrowAbi,
    functionName: "getTotalLocked",
    args: [BigInt(tokenId)],
  });

  const result = evmClient
    .callContract(runtime, {
      call: {
        to: hexToBase64(escrow),
        data: hexToBase64(callData),
      },
    })
    .result();

  const dataHex = bytesToHex(result.data);
  return decodeFunctionResult({
    abi: escrowAbi,
    functionName: "getTotalLocked",
    data: dataHex,
  }) as bigint;
};

export const getLockedBalance = (runtime: Runtime<Config>, user: string, tokenId: string): bigint => {
  const escrow = runtime.config.polygon.escrowAddress;
  if (isPlaceholderAddress(escrow)) {
    return 0n;
  }

  const evmClient = getPolygonClient(runtime);
  const callData = encodeFunctionData({
    abi: escrowAbi,
    functionName: "getLockedBalance",
    args: [user as `0x${string}`, BigInt(tokenId)],
  });

  const result = evmClient
    .callContract(runtime, {
      call: {
        to: hexToBase64(escrow),
        data: hexToBase64(callData),
      },
    })
    .result();

  const dataHex = bytesToHex(result.data);
  return decodeFunctionResult({
    abi: escrowAbi,
    functionName: "getLockedBalance",
    data: dataHex,
  }) as bigint;
};
