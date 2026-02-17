import type { OrderBookLevel } from '../lib/mock-data';

interface OrderBookChartProps {
  levels: OrderBookLevel[];
  isActive: boolean;
}

export function OrderBookChart({ levels, isActive }: OrderBookChartProps) {
  const MAX_LEVELS = 10; // Show only top 10 levels
  const displayLevels = levels.slice(0, MAX_LEVELS);
  const hiddenCount = levels.length - MAX_LEVELS;
  
  const maxSize = Math.max(...displayLevels.map(l => l.size), 1);
  const totalDepth = levels.reduce((sum, l) => sum + l.size * l.price, 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white/70">Order Book Depth (Top {MAX_LEVELS})</h3>
        <span className="text-xs font-mono text-white/40">
          Total: ${totalDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      {displayLevels.map((level, i) => {
        const widthPercent = (level.size / maxSize) * 100;
        const intensity = isActive ? Math.max(0.2, 1 - i * 0.07) : 0.15;

        return (
          <div key={level.price} className="flex items-center gap-2 group">
            {/* Price label */}
            <span className="text-xs font-mono text-white/50 w-10 text-right shrink-0">
              ${level.price.toFixed(2)}
            </span>

            {/* Bar */}
            <div className="flex-1 h-6 bg-white/[0.03] rounded overflow-hidden relative">
              <div
                className="h-full rounded transition-all duration-1000 ease-out relative"
                style={{
                  width: `${widthPercent}%`,
                  background: isActive
                    ? `linear-gradient(90deg, rgba(99, 102, 241, ${intensity}) 0%, rgba(99, 102, 241, ${intensity * 0.4}) 100%)`
                    : `rgba(55, 65, 81, ${intensity})`,
                }}
              >
                {/* Shimmer effect for active bars */}
                {isActive && (
                  <div
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                    }}
                  />
                )}
              </div>

              {/* Size label inside bar */}
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/30 group-hover:text-white/60 transition-colors">
                {level.size.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
      
      {hiddenCount > 0 && (
        <div className="mt-2 text-center text-[10px] text-white/30">
          + {hiddenCount} more level{hiddenCount === 1 ? '' : 's'} (${(totalDepth - displayLevels.reduce((sum, l) => sum + l.size * l.price, 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })} depth)
        </div>
      )}
    </div>
  );
}
