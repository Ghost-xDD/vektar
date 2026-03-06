import { Layers, Shield, Circle } from 'lucide-react';
import { LOGOS } from '../lib/logos';
import { ResetPositionButton } from './ResetPositionButton';

interface PositionCardProps {
  userAddress: `0x${string}` | null;
  shares: number;
  settled: boolean;
  polygonAddress: `0x${string}` | null;
  shieldedAddress: `0x${string}` | null;
  newShieldedAddress?: `0x${string}` | null;
  lockedShares: number;
  hasPosition: boolean;
  isLoading: boolean;
  isConnected: boolean;
  isCorrectChain: boolean;
}

function truncateAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function getStatus(settled: boolean, hasPosition: boolean) {
  if (settled) return { label: 'Exited', color: 'text-zinc-500', bg: 'bg-zinc-100', dot: 'bg-zinc-400' };
  if (hasPosition) return { label: 'Active', color: 'text-green-600', bg: 'bg-green-50', dot: 'bg-green-500' };
  return { label: 'No position', color: 'text-zinc-400', bg: 'bg-zinc-50', dot: 'bg-zinc-300' };
}

export function PositionCard({
  userAddress,
  shares,
  settled,
  polygonAddress,
  shieldedAddress,
  newShieldedAddress,
  lockedShares,
  hasPosition,
  isLoading,
  isConnected,
  isCorrectChain
}: PositionCardProps) {
  const status = getStatus(settled, hasPosition);
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Position</h3>
        <span
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* Market info */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">Market</span>
          <span className="font-medium text-zinc-800">BTC $100k YES</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">Shares locked</span>
          <span className="font-semibold font-mono text-zinc-900">
            {isLoading ? '...' : (shares > 0 ? shares.toLocaleString() : lockedShares.toLocaleString())}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1">
            <img src={LOGOS.polygon} alt="" className="w-3 h-3 rounded object-contain" />
            <span className="text-zinc-500">Escrow chain</span>
          </div>
          <span className="text-[#7b3fe4] font-medium">Polygon</span>
        </div>
      </div>

      {/* Addresses */}
      <div className="space-y-2">
        {polygonAddress && polygonAddress !== ZERO_ADDR && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Polygon address</span>
            <span className="text-[11px] font-mono text-zinc-600">
              {truncateAddr(polygonAddress)}
            </span>
          </div>
        )}

        {shieldedAddress && shieldedAddress !== ZERO_ADDR && (
          <div className="bg-orange-50/60 border border-orange-100 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-orange-500" />
              <span className="text-[11px] font-medium text-orange-600">Shielded address</span>
            </div>
            <p className="text-[11px] font-mono text-zinc-700">{truncateAddr(shieldedAddress)}</p>
            <p className="text-[10px] text-zinc-400">Private payout routes here via CRE</p>
          </div>
        )}

        {(!shieldedAddress || shieldedAddress === ZERO_ADDR) && !isLoading && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <Circle className="w-3 h-3" />
            <span>No shielded address registered yet</span>
          </div>
        )}
      </div>

      {/* Settled state + reset */}
      {settled && (
        <div className="space-y-3">
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-center">
            <p className="text-[12px] text-zinc-600 font-medium">Position exited via earlyExit()</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              USDC paid out · private payout completed
            </p>
          </div>
          <div className="border-t border-zinc-100 pt-3">
            <p className="text-[10px] text-zinc-400 mb-2 text-center uppercase tracking-wide font-medium">Demo reset</p>
            <ResetPositionButton
              userAddress={userAddress}
              polygonAddress={polygonAddress}
              shieldedAddress={shieldedAddress}
              newShieldedAddress={newShieldedAddress}
              isConnected={isConnected}
              isCorrectChain={isCorrectChain}
            />
          </div>
        </div>
      )}
    </div>
  );
}
