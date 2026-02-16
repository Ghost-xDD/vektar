interface HealthFactorProps {
  value: number;
  isActive: boolean;
}

function getHealthColor(value: number): string {
  if (value === 0) return '#374151';
  if (value >= 1.5) return '#10b981';
  if (value >= 1.0) return '#f59e0b';
  return '#ef4444';
}

function getHealthLabel(value: number): string {
  if (value === 0) return 'N/A';
  if (value >= 1.5) return 'Safe';
  if (value >= 1.0) return 'Warning';
  return 'Danger';
}

export function HealthFactor({ value, isActive }: HealthFactorProps) {
  const color = getHealthColor(value);
  const label = getHealthLabel(value);
  const fillPercent = isActive ? Math.min((value / 3) * 100, 100) : 0;
  const isDanger = value > 0 && value < 1.0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/70">Health Factor</h3>
        <div className="flex items-center gap-2">
          <span
            className="text-2xl font-bold font-mono transition-colors duration-500"
            style={{ color: isActive ? color : '#4b5563' }}
          >
            {isActive && value > 0 ? value.toFixed(2) : '—'}
          </span>
          {isActive && value > 0 && (
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isDanger ? 'animate-pulse' : ''
              }`}
              style={{
                color,
                background: `${color}15`,
                border: `1px solid ${color}30`,
              }}
            >
              {label}
            </span>
          )}
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-3 bg-white/[0.05] rounded-full overflow-hidden">
        {/* Segments */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 border-r border-white/[0.05]" /> {/* 0-1.0 danger */}
          <div className="flex-[0.5] border-r border-white/[0.05]" /> {/* 1.0-1.5 warning */}
          <div className="flex-[1.5]" /> {/* 1.5-3.0 safe */}
        </div>

        {/* Fill */}
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out relative"
          style={{
            width: `${fillPercent}%`,
            background: isActive
              ? `linear-gradient(90deg, ${color}cc, ${color}88)`
              : '#374151',
            boxShadow: isActive && value > 0 ? `0 0 12px ${color}40` : 'none',
          }}
        />
      </div>

      {/* Segment labels */}
      <div className="flex text-[10px] text-white/30">
        <div className="flex-1 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
          <span>{'< 1.0 Danger'}</span>
        </div>
        <div className="flex-[0.5] flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" />
          <span>1.0–1.5</span>
        </div>
        <div className="flex-[1.5] flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
          <span>{'> 1.5 Safe'}</span>
        </div>
      </div>
    </div>
  );
}
