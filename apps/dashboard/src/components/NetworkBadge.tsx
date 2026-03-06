interface NetworkBadgeProps {
  name: string;
  color: string;
  isConnected: boolean;
}

export function NetworkBadge({ name, color, isConnected }: NetworkBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-[11px]">
      <div
        className={`w-1.5 h-1.5 rounded-full transition-colors ${isConnected ? 'animate-pulse-dot' : ''}`}
        style={{ backgroundColor: isConnected ? color : '#d4d4d8' }}
      />
      <span className="text-zinc-600">{name}</span>
    </div>
  );
}
