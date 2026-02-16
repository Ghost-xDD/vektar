interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  color?: string;
  isActive?: boolean;
}

export function MetricCard({ label, value, subValue, color = '#ffffff', isActive = true }: MetricCardProps) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p
        className="text-lg font-semibold font-mono transition-colors duration-500"
        style={{ color: isActive ? color : '#4b5563' }}
      >
        {isActive ? value : '—'}
      </p>
      {subValue && (
        <p className="text-[10px] text-white/30 mt-0.5">{subValue}</p>
      )}
    </div>
  );
}
