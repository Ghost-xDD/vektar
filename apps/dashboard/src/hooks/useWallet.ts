import { useState, useEffect } from 'react';
import { createBaseWalletClient, baseFork } from '../lib/clients';

export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);

  const isCorrectChain = chainId === baseFork.id;

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;

    eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts[0]) setAddress(accounts[0] as `0x${string}`);
    });
    eth.request({ method: 'eth_chainId' }).then((id: string) => {
      setChainId(parseInt(id, 16));
    });

    const onAccounts = (accounts: string[]) => setAddress((accounts[0] as `0x${string}`) ?? null);
    const onChain = (id: string) => setChainId(parseInt(id, 16));

    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener('accountsChanged', onAccounts);
      eth.removeListener('chainChanged', onChain);
    };
  }, []);

  const connect = async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    setIsConnecting(true);
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      setAddress(accounts[0] as `0x${string}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const switchToBaseFork = async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${baseFork.id.toString(16)}` }]
      });
    } catch {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${baseFork.id.toString(16)}`,
          chainName: baseFork.name,
          nativeCurrency: baseFork.nativeCurrency,
          rpcUrls: [import.meta.env.VITE_BASE_TENDERLY_RPC]
        }]
      });
    }
  };

  const walletClient = address ? createBaseWalletClient() : null;

  return { address, connect, switchToBaseFork, isConnecting, isCorrectChain, walletClient };
}
