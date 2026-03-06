import { useQuery } from '@tanstack/react-query';
import { baseClient, polygonClient } from '../lib/clients';
import { vaultAbi, escrowAbi } from '../lib/abis';

const VAULT_ADDRESS   = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;
const ESCROW_ADDRESS  = import.meta.env.VITE_ESCROW_ADDRESS as `0x${string}`;
const TOKEN_ID        = BigInt(import.meta.env.VITE_TOKEN_ID);
const DEMO_ADDRESS    = import.meta.env.VITE_USER_ADDRESS as `0x${string}`;

export function usePosition(connectedAddress?: `0x${string}` | null) {
  const userAddress = connectedAddress ?? DEMO_ADDRESS;

  return useQuery({
    queryKey: ['position', userAddress, TOKEN_ID.toString()],
    queryFn: async () => {
      const pos = await baseClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'positions',
        args: [userAddress, TOKEN_ID]
      }) as readonly [bigint, bigint, bigint, boolean, `0x${string}`, `0x${string}`];

      const lockedShares = await polygonClient.readContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: 'getLockedBalance',
        args: [userAddress, TOKEN_ID]
      }) as bigint;

      return {
        tokenId:         pos[0],
        shares:          Number(pos[1]),
        paidOutUSDC:     Number(pos[2]) / 1e6,
        settled:         pos[3],
        polygonAddress:  pos[4],
        shieldedAddress: pos[5],
        lockedShares:    Number(lockedShares),
        hasPosition:     Number(lockedShares) > 0 || Number(pos[1]) > 0
      };
    },
    refetchInterval: 12000,
    staleTime: 10000,
    retry: 2
  });
}
