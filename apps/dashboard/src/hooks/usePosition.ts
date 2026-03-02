import { useQuery } from '@tanstack/react-query';
import { baseClient, polygonClient } from '../lib/clients';
import { vaultAbi, escrowAbi } from '../lib/abis';

const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS as `0x${string}`;
const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS as `0x${string}`;
const TOKEN_ID = BigInt(import.meta.env.VITE_TOKEN_ID);
const USER_ADDRESS = import.meta.env.VITE_USER_ADDRESS as `0x${string}`;

export function usePosition() {
  return useQuery({
    queryKey: ['position', USER_ADDRESS, TOKEN_ID.toString()],
    queryFn: async () => {
      try {
        // Read from Base: position details
        // Position struct: [tokenId, collateralAmount, debtAmount, lastLTVUpdate, liquidatable, liquidatableTimestamp, polygonAddress]
        const position = (await baseClient.readContract({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: 'positions',
          args: [USER_ADDRESS, TOKEN_ID],
        })) as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          boolean,
          bigint,
          `0x${string}`,
        ];

        // Read from Polygon: locked collateral
        const lockedCollateral = (await polygonClient.readContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: 'getLockedBalance',
          args: [USER_ADDRESS, TOKEN_ID],
        })) as bigint;

        // NOTE: Contract's calculateHealthFactor assumes $1.00 per share (simplified)
        // For accurate health factor, we need to calculate client-side using real spot price
        // This will be fixed by reading spot price from order book in the dashboard
        // 
        // For now, return a placeholder that the dashboard will override
        const healthFactorDecimal = 0; // Calculated in App.tsx using real prices

        return {
          tokenId: position[0],
          collateralAmount: position[1],
          debtAmount: position[2],
          lastLTVUpdate: position[3],
          liquidatable: position[4],
          liquidatableTimestamp: position[5],
          polygonAddress: position[6],
          lockedCollateral,
          healthFactor: healthFactorDecimal,
        };
      } catch (error) {
        console.error('Error reading position:', error);
        throw error;
      }
    },
    refetchInterval: 12000, // Poll every 12 seconds
    staleTime: 10000,
    retry: 3,
  });
}
