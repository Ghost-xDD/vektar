import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const ADMIN_RPC    = import.meta.env.VITE_BASE_TENDERLY_ADMIN_RPC as string;
const ACCESS_KEY   = import.meta.env.VITE_TENDERLY_ACCESS_KEY as string | undefined;
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS as string;

const ETH_AMOUNT  = '0x' + (1n * 10n ** 18n).toString(16);     // 1 ETH
const USDC_AMOUNT = '0x' + (10_000n * 10n ** 6n).toString(16); // 10,000 USDC

async function adminRpc(method: string, params: unknown[]) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ACCESS_KEY) headers['X-Access-Key'] = ACCESS_KEY;

  const res = await fetch(ADMIN_RPC, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return json.result;
}

export type FaucetToken = 'eth' | 'usdc';
export type ClaimStatus = 'idle' | 'pending' | 'done' | 'error';

export function useFaucet() {
  const queryClient = useQueryClient();
  const [ethStatus,  setEthStatus]  = useState<ClaimStatus>('idle');
  const [usdcStatus, setUsdcStatus] = useState<ClaimStatus>('idle');
  const [ethError,   setEthError]   = useState<string | null>(null);
  const [usdcError,  setUsdcError]  = useState<string | null>(null);

  const hasKey = !!ADMIN_RPC;

  const claimEth = async (address: `0x${string}`) => {
    setEthError(null);
    setEthStatus('pending');
    try {
      await adminRpc('tenderly_setBalance', [[address], ETH_AMOUNT]);
      setEthStatus('done');
      setTimeout(() => setEthStatus('idle'), 3000);
    } catch (err: any) {
      setEthError(err.message ?? 'Failed');
      setEthStatus('error');
    }
  };

  const claimUsdc = async (address: `0x${string}`) => {
    setUsdcError(null);
    setUsdcStatus('pending');
    try {
      await adminRpc('tenderly_setErc20Balance', [USDC_ADDRESS, address, USDC_AMOUNT]);
      setUsdcStatus('done');
      queryClient.invalidateQueries({ queryKey: ['position'] });
      setTimeout(() => setUsdcStatus('idle'), 3000);
    } catch (err: any) {
      setUsdcError(err.message ?? 'Failed');
      setUsdcStatus('error');
    }
  };

  return { claimEth, claimUsdc, ethStatus, usdcStatus, ethError, usdcError, hasKey };
}
