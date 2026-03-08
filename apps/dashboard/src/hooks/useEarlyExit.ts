import { useState } from 'react';
import { baseClient } from '../lib/clients';
import { vaultAbi } from '../lib/abis';
import { useWallet } from './useWallet';

const VAULT_ADDRESS = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;
const TOKEN_ID = BigInt(import.meta.env.VITE_TOKEN_ID);

const EARLY_EXIT_TOPIC =
  '0x9cd1be9e7cf031e64b4f8ab33421f620363f64621b39971db90843f80dd078f2';

export type ExitState =
  | 'idle'
  | 'pending_tx'
  | 'confirmed'
  | 'routing_private'
  | 'private_complete';

export function useEarlyExit() {
  const { address, walletClient } = useWallet();
  const [state, setState] = useState<ExitState>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [paidOutUSDC, setPaidOutUSDC] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = async () => {
    if (!walletClient || !address) return;
    setError(null);
    setState('pending_tx');
    try {
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'earlyExit',
        args: [TOKEN_ID],
        account: address
      });
      setTxHash(hash);

      const receipt = await baseClient.waitForTransactionReceipt({ hash });

      const exitLog = receipt.logs.find(
        (log) => log.topics[0] === EARLY_EXIT_TOPIC
      );
      if (exitLog) {
        const payoutRaw = BigInt(exitLog.data);
        setPaidOutUSDC(Number(payoutRaw) / 1e6);
      }

      setState('confirmed');

      // TODO: For the demo, advance to routing state automatically
      // In production, Handler 3 triggers this via CRE event watcher
      setTimeout(() => setState('routing_private'), 1500);
    } catch (err: any) {
      console.error('earlyExit failed:', err);
      setError(err?.shortMessage ?? err?.message ?? 'Transaction failed');
      setState('idle');
    }
  };

  const [transactionId, setTransactionId] = useState<string | null>(null);

  const markPrivateComplete = (txId?: string) => {
    setTransactionId(txId ?? null);
    setState('private_complete');
  };

  const reset = () => {
    setState('idle');
    setTxHash(null);
    setPaidOutUSDC(null);
    setError(null);
  };

  return { execute, state, txHash, paidOutUSDC, error, transactionId, markPrivateComplete, reset };
}
