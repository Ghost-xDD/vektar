import { useState } from 'react';
import { Shield, Copy, Check, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import type { GenerateState } from '../hooks/useShieldedAddress';
import type { RegisterState } from '../hooks/useRegisterPosition';

interface ShieldedAddressCardProps {
  shieldedAddress: `0x${string}` | null;
  generateState: GenerateState;
  generateError: string | null;
  registeredAddress?: `0x${string}` | null;
  hasShares: boolean;
  registerState: RegisterState;
  registerError?: string | null;
  onGenerate: () => void;
  onRegister: () => void;
}

function truncateAddr(addr: string) {
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

export function ShieldedAddressCard({
  shieldedAddress,
  generateState,
  generateError,
  registeredAddress,
  hasShares,
  registerState,
  registerError,
  onGenerate,
  onRegister,
}: ShieldedAddressCardProps) {
  const [copiedAddr, setCopiedAddr] = useState(false);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const isGenerating =
    generateState === 'switching-sepolia' ||
    generateState === 'signing' ||
    generateState === 'switching-back' ||
    generateState === 'fetching';
  const isRegistering = registerState === 'pending';
  const hasRegisteredAddress =
    !!registeredAddress &&
    registeredAddress !== '0x0000000000000000000000000000000000000000';
  const showRegisterPositionCta = hasRegisteredAddress && !hasShares;

  const generateLabel =
    generateState === 'switching-sepolia'
      ? 'Switching to Sepolia…'
      : generateState === 'signing'
      ? 'Sign in wallet…'
      : generateState === 'switching-back'
      ? 'Switching back to Base…'
      : generateState === 'fetching'
      ? 'Fetching from API…'
      : 'Generate Shielded Address';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Shielded Address</h3>
        </div>
        {registeredAddress && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100 font-medium">
            Registered
          </span>
        )}
      </div>

      {/* Registered shielded address from contract */}
      {registeredAddress &&
        registeredAddress !== '0x0000000000000000000000000000000000000000' && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-1">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">
              Registered shielded address
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono text-zinc-700">{truncateAddr(registeredAddress)}</p>
              <button
                onClick={() => copyToClipboard(registeredAddress)}
                className="shrink-0 p-1 rounded hover:bg-zinc-200 transition-colors"
              >
                {copiedAddr ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3 text-zinc-400" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400">
              Private payouts route here via CRE Handler 3
            </p>
          </div>
        )}

      {/* Generate / result area */}
      {!shieldedAddress ? (
        <div className="space-y-2">
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-zinc-700 transition-colors"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            {generateLabel}
          </button>
          <p className="text-[11px] text-zinc-400 text-center">
            Signs EIP-712 message · shielded address via Convergence API
          </p>
          {generateError && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{generateError}</span>
            </div>
          )}

          {showRegisterPositionCta &&
            (registerState === 'done' ? (
              <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-green-200 bg-green-50 text-sm font-medium text-green-700">
                <Check className="w-4 h-4" />
                Position registered on-chain
              </div>
            ) : (
              <button
                type="button"
                onClick={onRegister}
                disabled={isRegistering}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-orange-700 transition-colors"
              >
                {isRegistering && <Loader2 className="w-4 h-4 animate-spin" />}
                {isRegistering ? 'Registering position…' : 'Register Position'}
              </button>
            ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Generated address */}
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-medium text-orange-600 uppercase tracking-wide">
              New shielded address
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono text-zinc-800 break-all">
                {truncateAddr(shieldedAddress)}
              </p>
              <button
                onClick={() => copyToClipboard(shieldedAddress)}
                className="shrink-0 p-1 rounded hover:bg-orange-100 transition-colors"
              >
                {copiedAddr ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3 text-orange-400" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400">
              Generated by Convergence API · private payouts route here via CRE
            </p>
          </div>

          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 disabled:opacity-50 transition-colors"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Regenerate
          </button>

          {/* Register button */}
          {registerState === 'done' ? (
            <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-green-200 bg-green-50 text-sm font-medium text-green-700">
              <Check className="w-4 h-4" />
              Registered on-chain
            </div>
          ) : (
            <button
              type="button"
              onClick={onRegister}
              disabled={isRegistering}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-orange-700 transition-colors"
            >
              {isRegistering && <Loader2 className="w-4 h-4 animate-spin" />}
              {isRegistering ? 'Registering position…' : 'Register Position'}
            </button>
          )}

          {registerError && (
            <div className="flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{registerError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
