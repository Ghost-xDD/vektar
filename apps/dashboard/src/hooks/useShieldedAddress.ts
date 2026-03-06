import { useState } from 'react';
import { useWallet } from './useWallet';
import { baseFork } from '../lib/clients';

const SHIELDED_API = '/proxy/convergence/shielded-address';
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = `0x${SEPOLIA_CHAIN_ID.toString(16)}`;
const BASE_FORK_HEX = `0x${baseFork.id.toString(16)}`;

type EthProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

const buildTypedData = (account: string, timestamp: string) => ({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    'Generate Shielded Address': [
      { name: 'account', type: 'address' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
  primaryType: 'Generate Shielded Address',
  domain: {
    name: 'CompliantPrivateTokenDemo',
    version: '0.0.1',
    chainId: SEPOLIA_CHAIN_ID,
    verifyingContract: '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13',
  },
  message: { account, timestamp },
});

async function switchChain(eth: EthProvider, chainIdHex: string) {
  await eth.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: chainIdHex }],
  });
}

export type GenerateState = 'idle' | 'switching-sepolia' | 'signing' | 'switching-back' | 'fetching' | 'done' | 'error';

export function useShieldedAddress() {
  const { address } = useWallet();
  const [shieldedAddress, setShieldedAddress] = useState<`0x${string}` | null>(null);
  const [state, setState] = useState<GenerateState>('idle');
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const eth = (window as { ethereum?: EthProvider }).ethereum;
    if (!eth || !address) return;
    setError(null);

    try {
      // 1. Switch to Sepolia so MetaMask accepts the EIP-712 domain chainId
      setState('switching-sepolia');
      await switchChain(eth, SEPOLIA_HEX);

      // 2. Sign the typed data on Sepolia
      setState('signing');
      const timestamp = Date.now().toString();
      const typedData = buildTypedData(address, timestamp);
      const signature = (await eth.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      })) as string;

      // 3. Switch back to Base Fork immediately after signing
      setState('switching-back');
      await switchChain(eth, BASE_FORK_HEX);

      // 4. Call the Convergence API
      setState('fetching');
      const res = await fetch(SHIELDED_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: address, timestamp: parseInt(timestamp), auth: signature }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const addr: string =
        data.shieldedAddress ?? data.address ?? data.stealth_address ?? data.result;
      if (!addr) throw new Error('No shielded address in response');
      setShieldedAddress(addr as `0x${string}`);
      setState('done');
    } catch (err: unknown) {
      // Always attempt to switch back on failure
      try { await switchChain(eth, BASE_FORK_HEX); } catch { /* ignore */ }
      const msg = err instanceof Error ? err.message : 'Failed to generate shielded address';
      setError(msg);
      setState('error');
    }
  };

  const reset = () => {
    setShieldedAddress(null);
    setState('idle');
    setError(null);
  };

  return { generate, reset, shieldedAddress, state, error };
}
