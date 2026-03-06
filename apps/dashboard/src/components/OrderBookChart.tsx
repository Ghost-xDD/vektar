export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

interface OrderBookChartProps {
  levels: OrderBookLevel[];
  isActive: boolean;
}

export function OrderBookChart({ levels, isActive }: OrderBookChartProps) {
  const MAX_LEVELS = 12;
  const displayLevels = levels.slice(0, MAX_LEVELS);
  const maxSize = Math.max(...displayLevels.map((l) => l.size), 1);
  const totalDepth = levels.reduce((sum, l) => sum + l.size * l.price, 0);
  const hiddenCount = levels.length - MAX_LEVELS;

  if (!isActive || displayLevels.length === 0) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-300 w-10 text-right">
              $0.{Math.round((0.45 - i * 0.03) * 100).toString().padStart(2, '0')}
            </span>
            <div className="flex-1 h-5 bg-zinc-100 rounded-sm overflow-hidden">
              <div
                className="h-full bg-zinc-200 rounded-sm"
                style={{ width: `${Math.max(5, 90 - i * 10)}%`, opacity: 0.3 }}
              />
            </div>
          </div>
        ))}
        <p className="text-center text-[11px] text-zinc-400 pt-1">
          Waiting for Polymarket order book...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {displayLevels.map((level, i) => {
        const widthPercent = (level.size / maxSize) * 100;
        const intensity = Math.max(0.15, 1 - i * 0.07);

        return (
          <div key={level.price} className="flex items-center gap-2 group">
            <span className="text-[11px] font-mono text-zinc-500 w-10 text-right shrink-0">
              ${level.price.toFixed(2)}
            </span>
            <div className="flex-1 h-5 bg-zinc-100 rounded-sm overflow-hidden relative">
              <div
                className="h-full rounded-sm transition-all duration-700 ease-out"
                style={{
                  width: `${widthPercent}%`,
                  background: `rgba(249, 115, 22, ${intensity * 0.6})`
                }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-zinc-400 group-hover:text-zinc-600 transition-colors">
                {level.size.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <p className="text-center text-[10px] text-zinc-400 pt-1">
          + {hiddenCount} more price level{hiddenCount === 1 ? '' : 's'} ·{' '}
          ${totalDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })} total depth
        </p>
      )}
    </div>
  );
}
