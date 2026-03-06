import { RotateCcw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useResetPosition } from '../hooks/useResetPosition';

const DEFAULT_SHIELDED = '0x827113EBdF873A6126546bEdBCA2cFD7D4303FC9' as `0x${string}`;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`;

interface ResetPositionButtonProps {
  userAddress: `0x${string}` | null;
  polygonAddress: `0x${string}` | null;
  shieldedAddress: `0x${string}` | null;    // currently registered on-chain
  newShieldedAddress?: `0x${string}` | null; // newly generated from frontend
  isConnected: boolean;
  isCorrectChain: boolean;
}

export function ResetPositionButton({
  userAddress,
  polygonAddress,
  shieldedAddress,
  newShieldedAddress,
  isConnected,
  isCorrectChain
}: ResetPositionButtonProps) {
  const { reset, state, error } = useResetPosition();

  const canReset = isConnected && isCorrectChain && !!userAddress && state === 'idle';

  // Priority: newly generated > currently on-chain > default
  const effectiveShielded =
    (newShieldedAddress && newShieldedAddress !== ZERO_ADDR)
      ? newShieldedAddress
      : (shieldedAddress && shieldedAddress !== ZERO_ADDR)
      ? shieldedAddress
      : DEFAULT_SHIELDED;

  const handleReset = () => {
    if (!userAddress) return;
    reset(
      userAddress,
      polygonAddress && polygonAddress !== ZERO_ADDR ? polygonAddress : userAddress,
      effectiveShielded
    );
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleReset}
        disabled={!canReset}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all ${
          state === 'done'
            ? 'bg-green-50 border border-green-200 text-green-700 cursor-default'
            : state === 'error'
            ? 'bg-red-50 border border-red-200 text-red-600 cursor-default'
            : canReset
            ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
            : 'bg-zinc-100 border border-zinc-200 text-zinc-400 cursor-not-allowed'
        }`}
      >
        {state === 'pending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {state === 'done'    && <CheckCircle2 className="w-3.5 h-3.5" />}
        {state === 'error'   && <AlertCircle className="w-3.5 h-3.5" />}
        {(state === 'idle' || state === 'error') && <RotateCcw className="w-3.5 h-3.5" />}
        {state === 'pending' ? 'Resetting...'
         : state === 'done'  ? 'Reset — position is Active'
         : 'Reset Position for Demo'}
      </button>

      {!isConnected && (
        <p className="text-[10px] text-zinc-400 text-center">Connect wallet to reset</p>
      )}
      {isConnected && !isCorrectChain && (
        <p className="text-[10px] text-amber-600 text-center">Switch to Base Fork first</p>
      )}
      {error && (
        <div className="flex items-start gap-1.5 p-2 rounded bg-red-50 border border-red-100">
          <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[10px] text-red-600">{error}</p>
        </div>
      )}

      <div className="space-y-1 text-[10px] text-zinc-400 text-center leading-relaxed">
        <p>
          Uses <span className="font-mono">tenderly_setStorageAt</span> — sets{' '}
          <span className="font-mono">settled=false</span>,{' '}
          <span className="font-mono">shares=20000</span>,{' '}
          <span className="font-mono">paidOut=0</span>
        </p>
        <p>
          Shielded address:{' '}
          <span className={`font-mono ${newShieldedAddress ? 'text-orange-500' : 'text-zinc-400'}`}>
            {newShieldedAddress
              ? `${effectiveShielded.slice(0, 8)}... (new)`
              : shieldedAddress && shieldedAddress !== ZERO_ADDR
              ? `${effectiveShielded.slice(0, 8)}... (existing)`
              : 'default'}
          </span>
        </p>
      </div>
    </div>
  );
}
