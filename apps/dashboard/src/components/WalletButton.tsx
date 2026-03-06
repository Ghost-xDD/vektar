import { Wallet, AlertTriangle, Loader2 } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, connect, switchToBaseFork, isConnecting, isCorrectChain } = useWallet();

  if (!address) {
    return (
      <button
        onClick={connect}
        disabled={isConnecting}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isConnecting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Wallet className="w-3.5 h-3.5" />
        )}
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  if (!isCorrectChain) {
    return (
      <button
        onClick={switchToBaseFork}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-sm font-medium transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Switch to Base Fork
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-zinc-50 border border-zinc-200">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-dot" />
      <span className="text-sm font-mono text-zinc-700">{shortenAddr(address)}</span>
      <span className="text-[10px] text-zinc-400 hidden sm:inline">Base Fork</span>
    </div>
  );
}
