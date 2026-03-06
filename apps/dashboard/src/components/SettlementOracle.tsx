import { TrendingDown, Clock, Wifi, WifiOff } from 'lucide-react';
import { LOGOS } from '../lib/logos';

interface SettlementOracleProps {
  perShareUSDC: number;
  totalExitUSDC: number;
  spotPrice: number;
  secondsSinceUpdate: number;
  isStale: boolean;
  isActive: boolean;
  isLoading: boolean;
}

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}

export function SettlementOracle({
  perShareUSDC,
  totalExitUSDC,
  spotPrice,
  secondsSinceUpdate,
  isStale,
  isActive,
  isLoading
}: SettlementOracleProps) {
  const liquidityDiscount =
    spotPrice > 0 && perShareUSDC > 0
      ? ((spotPrice - perShareUSDC) / spotPrice) * 100
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">Settlement Oracle</h3>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 uppercase tracking-wide">
            CRE · 12s cycle
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isLoading ? (
            <span className="text-[10px] text-zinc-400">Loading...</span>
          ) : isStale || !isActive ? (
            <div className="flex items-center gap-1.5 text-amber-600">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium">Oracle stale</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-green-600">
              <Wifi className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* Primary metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-orange-50/60 border border-orange-100 rounded-xl p-4">
          <p className="text-[11px] font-medium text-orange-600 uppercase tracking-wide mb-1.5">
            Per-share exit price
          </p>
          <p className="text-2xl font-semibold font-mono text-zinc-900 tabular-nums">
            {isActive ? `$${perShareUSDC.toFixed(4)}` : '—'}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">USDC · oracle VWAP</p>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
            Total exit value
          </p>
          <p className="text-2xl font-semibold font-mono text-zinc-900 tabular-nums">
            {isActive
              ? `$${totalExitUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '—'}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">20,000 shares</p>
        </div>
      </div>

      {/* Spot comparison row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
          <p className="text-[11px] text-zinc-400 uppercase tracking-wide mb-1">Spot price</p>
          <p className="text-base font-semibold font-mono text-zinc-800">
            {spotPrice > 0 ? `$${spotPrice.toFixed(3)}` : '—'}
          </p>
          <p className="text-[10px] text-zinc-400 flex items-center gap-1">
            <img src={LOGOS.polymarket} alt="" className="w-2.5 h-2.5 rounded object-contain" />
            Polymarket top bid
          </p>
        </div>

        <div
          className={`border rounded-lg p-3 ${
            liquidityDiscount !== null && liquidityDiscount > 5
              ? 'bg-red-50 border-red-100'
              : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown className="w-3 h-3 text-zinc-400" />
            <p className="text-[11px] text-zinc-400 uppercase tracking-wide">Liquidity discount</p>
          </div>
          <p
            className={`text-base font-semibold font-mono ${
              liquidityDiscount !== null && liquidityDiscount > 5
                ? 'text-red-600'
                : 'text-zinc-800'
            }`}
          >
            {liquidityDiscount !== null
              ? `${liquidityDiscount.toFixed(1)}% below`
              : '—'}
          </p>
          <p className="text-[10px] text-zinc-400">oracle vs spot</p>
        </div>
      </div>

      {/* Last updated */}
      {isActive && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Clock className="w-3 h-3" />
          <span>Last updated {formatAgo(secondsSinceUpdate)}</span>
          {!isStale && (
            <span className="text-green-500 font-medium ml-1">✓ Live</span>
          )}
        </div>
      )}

      {/* Explanation */}
      <p className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-100 pt-3">
        The gap between spot and oracle is the liquidity illusion. CRE computes VWAP
        against real Polymarket bid depth — if liquidity drains, the oracle collapses
        while spot stays flat.
      </p>
    </div>
  );
}
