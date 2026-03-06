import { useState } from 'react';
import { baseClient } from '../lib/clients';
import { vaultAbi } from '../lib/abis';
import { useWallet } from './useWallet';
import { useQueryClient } from '@tanstack/react-query';

const VAULT_ADDRESS    = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;
const TOKEN_ID         = BigInt(import.meta.env.VITE_TOKEN_ID);
const SHARES           = 20_000n;
const DEFAULT_SHIELDED = '0x827113EBdF873A6126546bEdBCA2cFD7D4303FC9' as `0x${string}`;

export type RegisterState = 'idle' | 'pending' | 'done' | 'error';

export function useRegisterPosition() {
  const { address, walletClient } = useWallet();
  const queryClient = useQueryClient();
  const [state, setState] = useState<RegisterState>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const register = async (shieldedAddress?: `0x${string}`) => {
    if (!walletClient || !address) return;
    setError(null);
    setState('pending');
    try {
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'registerPosition',
        args: [
          address,                              // user = connected wallet
          TOKEN_ID,
          SHARES,
          address,                              // polygonAddress = connected wallet
          shieldedAddress ?? DEFAULT_SHIELDED
        ],
        account: address
      });
      setTxHash(hash);
      await baseClient.waitForTransactionReceipt({ hash });
      setState('done');
      queryClient.invalidateQueries({ queryKey: ['position'] });
    } catch (err: any) {
      setError(err?.shortMessage ?? err?.message ?? 'Transaction failed');
      setState('error');
    }
  };

  const resetState = () => {
    setState('idle');
    setTxHash(null);
    setError(null);
  };

  return { register, state, txHash, error, resetState, address };
}
