import type { Position } from '../lib/mock-data';
import { Layers, ArrowRightLeft, ExternalLink } from 'lucide-react';

interface PositionCardProps {
  position: Position;
  isActive: boolean;
  collateralValueUsd: number;
}

function getStatusConfig(status: Position['status']) {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.1)',
        border: 'rgba(16, 185, 129, 0.2)',
      };
    case 'warning':
      return {
        label: 'Warning',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.1)',
        border: 'rgba(245, 158, 11, 0.2)',
      };
    case 'liquidatable':
      return {
        label: 'LIQUIDATABLE',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.1)',
        border: 'rgba(239, 68, 68, 0.3)',
      };
    case 'settled':
      return {
        label: 'SETTLED',
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.35)',
      };
    default:
      return {
        label: 'N/A',
        color: '#6b7280',
        bg: 'transparent',
        border: 'transparent',
      };
  }
}

export function PositionCard({
  position,
  isActive,
  collateralValueUsd,
}: PositionCardProps) {
  const statusConfig = getStatusConfig(position.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">Active Position</h3>
        {isActive && (
          <span
            className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
              position.status === 'liquidatable' ? 'animate-pulse' : ''
            } ${position.status === 'settled' ? 'ring-2 ring-green-400/40' : ''}`}
            style={{
              color: statusConfig.color,
              background: statusConfig.bg,
              border: `1px solid ${statusConfig.border}`,
            }}
          >
            {statusConfig.label}
          </span>
        )}
      </div>

      {/* Position details: Collateral (Yes shares) + Debt (USDC) with chain labels */}
      <div className="grid grid-cols-2 gap-3">
        {/* Collateral */}
        <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-4 h-4 rounded-full bg-[#7b3fe4]/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#7b3fe4]" />
            </div>
            <span className="text-[10px] text-white/40 uppercase tracking-wider">
              Collateral
            </span>
          </div>
          <p className="text-lg font-semibold font-mono text-white/90">
            {position.collateralShares.toLocaleString()}
          </p>
          <p className="text-xs text-white/40">
            Yes shares (${collateralValueUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
          </p>
          <p className="text-[10px] text-[#7b3fe4]/70 mt-1 font-mono">
            Polygon Amoy
          </p>
        </div>

        {/* Debt */}
        <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-4 h-4 rounded-full bg-[#0052ff]/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#0052ff]" />
            </div>
            <span className="text-[10px] text-white/40 uppercase tracking-wider">
              Debt
            </span>
          </div>
          <p className="text-lg font-semibold font-mono text-white/90">
            ${position.debtUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-white/40">USDC borrowed</p>
          <p className="text-[10px] text-[#0052ff]/70 mt-1 font-mono">
            Base Sepolia
          </p>
        </div>
      </div>

      {/* Cross-chain indicator */}
      <div className="flex items-center justify-center gap-3 py-2">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-[#7b3fe4]" />
          <span className="text-[10px] text-white/40">Polygon</span>
        </div>
        <ArrowRightLeft className="w-3.5 h-3.5 text-white/20" />
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-[#0052ff]" />
          <span className="text-[10px] text-white/40">Base</span>
        </div>
      </div>

      {/* Settlement info (shown when settled) — all inferred from on-chain: debt=0, locked=0 */}
      {position.status === 'settled' && (
        <div className="bg-green-500/5 rounded-lg p-3 border border-green-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-semibold text-green-400">
              Settlement complete
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="text-[10px] text-green-400/80 flex items-center gap-1">
              Base: debt cleared <span className="text-green-400">&#10003;</span>
            </span>
            <span className="text-[10px] text-green-400/80 flex items-center gap-1">
              Polygon: collateral released <span className="text-green-400">&#10003;</span>
            </span>
          </div>
        </div>
      )}

      {/* Explorer links */}
      <div className="flex gap-2">
        <a
          href="https://sepolia.basescan.org"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors py-1.5 rounded border border-white/[0.04] hover:border-white/10"
        >
          <ExternalLink className="w-3 h-3" />
          Basescan
        </a>
        <a
          href="https://amoy.polygonscan.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors py-1.5 rounded border border-white/[0.04] hover:border-white/10"
        >
          <ExternalLink className="w-3 h-3" />
          Polygonscan
        </a>
      </div>
    </div>
  );
}
