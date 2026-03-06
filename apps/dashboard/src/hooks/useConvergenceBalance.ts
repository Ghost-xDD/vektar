import { useState } from 'react';
import { useWallet } from './useWallet';
import { baseFork } from '../lib/clients';

const BALANCE_API = '/proxy/convergence/balances';
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = `0x${SEPOLIA_CHAIN_ID.toString(16)}`;
const BASE_FORK_HEX = `0x${baseFork.id.toString(16)}`;

type EthProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

const buildTypedData = (account: string, timestamp: string) => ({
  types: {
    EIP712Domain: [
      { name: 'name',             type: 'string'  },
      { name: 'version',          type: 'string'  },
      { name: 'chainId',          type: 'uint256' },
      { name: 'verifyingContract',type: 'address' },
    ],
    'Retrieve Balances': [
      { name: 'account',   type: 'address' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  primaryType: 'Retrieve Balances',
  domain: {
    name:             'CompliantPrivateTokenDemo',
    version:          '0.0.1',
    chainId:          SEPOLIA_CHAIN_ID,
    verifyingContract:'0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13',
  },
  message: { account, timestamp },
});

async function switchChain(eth: EthProvider, chainIdHex: string) {
  await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
}

function formatLinkBalance(raw: string): string {
  const wei = BigInt(raw);
  const whole = wei / 10n ** 18n;
  const frac  = (wei % 10n ** 18n) / 10n ** 14n; // 4 decimal places
  return `${whole}.${frac.toString().padStart(4, '0')} LINK`;
}

export type BalanceState = 'idle' | 'switching-sepolia' | 'signing' | 'switching-back' | 'fetching' | 'done' | 'error';

export interface ConvergenceBalance {
  formatted: string;
  raw: string;
  token: string;
}

export function useConvergenceBalance() {
  const { address } = useWallet();
  const [balances, setBalances] = useState<ConvergenceBalance[]>([]);
  const [state, setState] = useState<BalanceState>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    const eth = (window as { ethereum?: EthProvider }).ethereum;
    if (!eth || !address) return;
    setError(null);

    try {
      setState('switching-sepolia');
      await switchChain(eth, SEPOLIA_HEX);

      setState('signing');
      const timestamp = Date.now().toString();
      const typedData = buildTypedData(address, timestamp);
      const signature = (await eth.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      })) as string;

      setState('switching-back');
      await switchChain(eth, BASE_FORK_HEX);

      setState('fetching');
      const res = await fetch(BALANCE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: address, timestamp: parseInt(timestamp), auth: signature }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      // Parse various possible response shapes
      const rawList: Array<{ token?: string; balance?: string; amount?: string }> =
        Array.isArray(data.balances) ? data.balances
        : Array.isArray(data)        ? data
        : data.balance != null       ? [{ balance: data.balance }]
        : [];

      const parsed: ConvergenceBalance[] = rawList.map(b => {
        const raw = b.balance ?? b.amount ?? '0';
        return { formatted: formatLinkBalance(raw), raw, token: b.token ?? 'LINK' };
      });

      setBalances(parsed.length ? parsed : [{ formatted: '0.0000 LINK', raw: '0', token: 'LINK' }]);
      setState('done');
    } catch (err: unknown) {
      try { await switchChain(eth, BASE_FORK_HEX); } catch { /* ignore */ }
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
      setState('error');
    }
  };

  const reset = () => {
    setBalances([]);
    setState('idle');
    setError(null);
  };

  return { fetchBalance, reset, balances, state, error };
}
