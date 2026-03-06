import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  Lock,
  ExternalLink,
  AlertCircle,
  RotateCcw,
  Shield
} from 'lucide-react';
import type { ExitState } from '../hooks/useEarlyExit';

interface EarlyExitButtonProps {
  state: ExitState;
  txHash: `0x${string}` | null;
  paidOutUSDC: number | null;
  totalExitUSDC: number;
  error: string | null;
  isOracleActive: boolean;
  isOracleStale: boolean;
  isSettled: boolean;
  isConnected: boolean;
  isCorrectChain: boolean;
  onExecute: () => void;
  onMarkComplete: () => void;
  onReset: () => void;
}

export function EarlyExitButton({
  state,
  txHash,
  paidOutUSDC,
  totalExitUSDC,
  error,
  isOracleActive,
  isOracleStale,
  isSettled,
  isConnected,
  isCorrectChain,
  onExecute,
  onMarkComplete,
  onReset
}: EarlyExitButtonProps) {
  const canExit =
    isConnected &&
    isCorrectChain &&
    isOracleActive &&
    !isOracleStale &&
    !isSettled &&
    state === 'idle';

  const exitValue = paidOutUSDC ?? totalExitUSDC;

  if (isSettled) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-sm font-semibold text-green-700">Position Settled</span>
        </div>
        {paidOutUSDC !== null && (
          <p className="text-xs text-green-600 font-mono">${paidOutUSDC.toFixed(2)} USDC paid out</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Idle state: main exit button */}
      {state === 'idle' && (
        <div className="space-y-3">
          <button
            onClick={onExecute}
            disabled={!canExit}
            className={`w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              canExit
                ? 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm hover:shadow-md active:scale-[0.99]'
                : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            Early Exit — Receive{' '}
            {totalExitUSDC > 0
              ? `$${totalExitUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC Now`
              : 'USDC Now'}
          </button>

          {/* Subtext */}
          <div className="text-center space-y-1">
            {!isConnected ? (
              <p className="text-[11px] text-zinc-400">Connect wallet to exit</p>
            ) : !isCorrectChain ? (
              <p className="text-[11px] text-amber-600">Switch to Base Tenderly Fork first</p>
            ) : isOracleStale ? (
              <p className="text-[11px] text-amber-600">⚠ Oracle stale — wait for next CRE cycle</p>
            ) : !isOracleActive ? (
              <p className="text-[11px] text-zinc-400">Waiting for first oracle update...</p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Signs earlyExit(tokenId) on Base · USDC paid from pool immediately
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-600">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Pending tx */}
      {state === 'pending_tx' && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            <div>
              <p className="text-sm font-semibold text-zinc-800">Sending transaction...</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Signing earlyExit(tokenId) on Base</p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmed + routing */}
      {(state === 'confirmed' || state === 'routing_private') && txHash && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-zinc-800">
                ${exitValue.toFixed(2)} USDC transferred
              </p>
              <a
                href={`https://dashboard.tenderly.co/explorer/vnet/2e625465-6c0e-4577-b01f-790eb8000996/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 transition-colors mt-1 font-mono"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
                <ExternalLink className="w-3 h-3" />
                <span className="font-sans">View on Tenderly</span>
              </a>
            </div>
          </div>

          {/* Private routing status */}
          <div className="border-t border-zinc-200 pt-3">
            <div className="flex items-center gap-2.5">
              {state === 'routing_private' ? (
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <div>
                <p className="text-[12px] font-medium text-zinc-600">
                  CRE routing payout to shielded address...
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Operator signed EIP-712 transfer · Convergence private vault
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onMarkComplete}
            className="w-full text-[11px] text-zinc-500 hover:text-zinc-700 transition-colors py-1"
          >
            Mark private payout complete →
          </button>
        </div>
      )}

      {/* Private complete */}
      {state === 'private_complete' && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Private payout complete</p>
              <p className="text-[11px] text-green-600 mt-0.5">
                transaction_id: 019cc054-4db0-7c61-aa2d-5bf65c456bd0
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white/60 rounded-lg p-2.5 border border-green-200">
              <p className="text-green-700 font-medium">Recipient</p>
              <p className="text-green-600 mt-0.5">private</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2.5 border border-green-200">
              <p className="text-green-700 font-medium">Amount</p>
              <p className="text-green-600 mt-0.5">private</p>
            </div>
          </div>
          <p className="text-[10px] text-green-600/80">
            No on-chain link between exit and payout destination.
          </p>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset demo
          </button>
        </div>
      )}
    </div>
  );
}
