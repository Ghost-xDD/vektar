import { useQuery } from '@tanstack/react-query';
import { baseClient } from '../lib/clients';
import { vaultAbi } from '../lib/abis';
import { isLightRpcMode } from '../lib/rpc-mode';

const VAULT_ADDRESS = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;
const TOKEN_ID = BigInt(import.meta.env.VITE_TOKEN_ID);
const SHARES = 20_000n;

export function useSettlementValue() {
  return useQuery({
    queryKey: ['settlementValue', TOKEN_ID.toString()],
    queryFn: async () => {
      const [valueUSDC, lastUpdated] = await baseClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'getSettlementValue',
        args: [TOKEN_ID]
      }) as [bigint, bigint];

      const perShareUSDC = Number(valueUSDC) / 1e6;
      const totalExitRaw = SHARES * valueUSDC;
      const totalExitUSDC = Number(totalExitRaw) / 1e6;

      const secondsSinceUpdate = Math.floor(Date.now() / 1000) - Number(lastUpdated);
      const isStale = secondsSinceUpdate > 60;
      const isActive = Number(valueUSDC) > 0;

      return {
        perShareUSDC,
        totalExitUSDC,
        lastUpdated: new Date(Number(lastUpdated) * 1000),
        secondsSinceUpdate,
        isStale,
        isActive
      };
    },
    refetchInterval: isLightRpcMode ? false : 60000,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2
  });
}
