import { Droplets, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { LOGOS } from '../lib/logos';
import { useFaucet, type ClaimStatus } from '../hooks/useFaucet';

interface FaucetCardProps {
  address: `0x${string}` | null;
  isCorrectChain: boolean;
}

interface ClaimButtonProps {
  label: string;
  amount: string;
  symbol: string;
  status: ClaimStatus;
  error: string | null;
  disabled: boolean;
  onClick: () => void;
}

function ClaimButton({ label, amount, symbol, status, error, disabled, onClick }: ClaimButtonProps) {
  return (
    <div className="space-y-1.5">
      <button
        onClick={onClick}
        disabled={disabled || status === 'pending'}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium border transition-all ${
          status === 'done'
            ? 'bg-green-50 border-green-200 text-green-700 cursor-default'
            : status === 'error'
            ? 'bg-red-50 border-red-200 text-red-600 cursor-default'
            : disabled
            ? 'bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed'
            : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700'
        }`}
      >
        <span>{label}</span>
        <div className="flex items-center gap-1.5">
          {status === 'pending' && <Loader2 className="w-3 h-3 animate-spin" />}
          {status === 'done'    && <CheckCircle2 className="w-3 h-3 text-green-600" />}
          {status === 'error'   && <AlertCircle className="w-3 h-3 text-red-500" />}
          <span className="font-mono font-semibold">
            {status === 'done'
              ? 'Claimed!'
              : status === 'pending'
              ? 'Sending...'
              : `${amount} ${symbol}`}
          </span>
        </div>
      </button>
      {error && (
        <p className="text-[10px] text-red-500 px-1">{error}</p>
      )}
    </div>
  );
}

export function FaucetCard({ address, isCorrectChain }: FaucetCardProps) {
  const { claimEth, claimUsdc, ethStatus, usdcStatus, ethError, usdcError } = useFaucet();

  const canClaim = !!address && isCorrectChain;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Droplets className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-900">Faucet</h3>
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200 font-medium">
          <img src={LOGOS.base} alt="" className="w-3 h-3 rounded object-contain" />
          Base Fork
        </span>
      </div>

      {!address ? (
        <p className="text-xs text-zinc-400 text-center py-2">Connect wallet to claim</p>
      ) : !isCorrectChain ? (
        <p className="text-xs text-amber-600 text-center py-2">Switch to Base Fork first</p>
      ) : (
        <div className="space-y-2">
          <ClaimButton
            label="Claim ETH"
            amount="1"
            symbol="ETH"
            status={ethStatus}
            error={ethError}
            disabled={!canClaim}
            onClick={() => claimEth(address)}
          />
          <ClaimButton
            label="Claim USDC"
            amount="10,000"
            symbol="USDC"
            status={usdcStatus}
            error={usdcError}
            disabled={!canClaim}
            onClick={() => claimUsdc(address)}
          />
        </div>
      )}

      <p className="text-[10px] text-zinc-400 leading-relaxed">
        Uses <span className="font-mono">tenderly_setBalance</span> and{' '}
        <span className="font-mono">tenderly_setErc20Balance</span> — no signature required.
        Funds appear instantly on the fork.
      </p>
    </div>
  );
}
