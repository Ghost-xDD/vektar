import { useQuery } from '@tanstack/react-query';
import { baseClient } from '../lib/clients';
import { vaultAbi } from '../lib/abis';

const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS as `0x${string}`;
const TOKEN_ID = BigInt(import.meta.env.VITE_TOKEN_ID);

export function useMarketLTV() {
  return useQuery({
    queryKey: ['marketLTV', TOKEN_ID.toString()],
    queryFn: async () => {
      try {
        // Read the MarketData struct which contains currentLTV
        const marketData = await baseClient.readContract({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: 'markets',
          args: [TOKEN_ID]
        }) as readonly [bigint, bigint, bigint, boolean]; // [currentLTV, lastUpdate, totalCollateral, active]
        
        const ltvBps = marketData[0]; // currentLTV is the first field
        
        return {
          dynamicLtvBps: Number(ltvBps),
          dynamicLtvPercent: Number(ltvBps) / 100, // convert bps to %
          lastUpdate: Number(marketData[1]),
          totalCollateral: marketData[2],
          active: marketData[3]
        };
      } catch (error) {
        console.error('Error reading market LTV:', error);
        throw error;
      }
    },
    refetchInterval: 12000, // Poll every 12 seconds (matches CRE cycle)
    staleTime: 10000,
    retry: 3
  });
}
