import { useState } from 'react';
import { Shield, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';

interface ShieldedAddressCardProps {
  shieldedAddress: `0x${string}` | null;
  shieldedKey: `0x${string}` | null;
  registeredAddress?: `0x${string}` | null;
  onGenerate: () => void;
}

function truncateAddr(addr: string) {
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

export function ShieldedAddressCard({
  shieldedAddress,
  shieldedKey,
  registeredAddress,
  onGenerate
}: ShieldedAddressCardProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const copyToClipboard = async (text: string, which: 'key' | 'addr') => {
    await navigator.clipboard.writeText(text);
    if (which === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    }
  };

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

      {/* Show registered shielded address from contract */}
      {registeredAddress &&
        registeredAddress !== '0x0000000000000000000000000000000000000000' && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-1">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">
              Registered vault address
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono text-zinc-700">{truncateAddr(registeredAddress)}</p>
              <button
                onClick={() => copyToClipboard(registeredAddress, 'addr')}
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

      {/* Generate new address */}
      {!shieldedAddress ? (
        <div className="space-y-2">
          <button
            onClick={onGenerate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-sm font-medium text-zinc-700 transition-colors"
          >
            <Shield className="w-4 h-4" />
            Generate Shielded Address
          </button>
          <p className="text-[11px] text-zinc-400 text-center">
            Client-side keygen — no external call
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Generated address */}
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-medium text-orange-600 uppercase tracking-wide">
              New shielded address
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-mono text-zinc-800 break-all">{truncateAddr(shieldedAddress)}</p>
              <button
                onClick={() => copyToClipboard(shieldedAddress, 'addr')}
                className="shrink-0 p-1 rounded hover:bg-orange-100 transition-colors"
              >
                {copiedAddr ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3 text-orange-400" />
                )}
              </button>
            </div>
          </div>

          {/* Private key warning */}
          {shieldedKey && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <p className="text-[11px] font-semibold text-amber-700">
                  Save your private key — not stored anywhere
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-mono text-amber-800 break-all">
                  {shieldedKey.slice(0, 18)}...{shieldedKey.slice(-8)}
                </p>
                <button
                  onClick={() => copyToClipboard(shieldedKey, 'key')}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 transition-colors text-[10px] font-medium text-amber-700"
                >
                  {copiedKey ? (
                    <><Check className="w-3 h-3" /> Copied</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy</>
                  )}
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-zinc-400">
            This address receives your private payout via CRE.
            Your public address is never linked to it on-chain.
          </p>

          <button
            onClick={onGenerate}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
