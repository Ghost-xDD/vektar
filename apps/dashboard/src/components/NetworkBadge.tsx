import { Wifi, WifiOff } from 'lucide-react';

interface NetworkBadgeProps {
  name: string;
  color: string;
  isConnected: boolean;
}

export function NetworkBadge({ name, color, isConnected }: NetworkBadgeProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all duration-300"
      style={{
        color: isConnected ? color : '#6b7280',
        background: isConnected ? `${color}10` : 'transparent',
        borderColor: isConnected ? `${color}25` : '#1a1a2e',
      }}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse-glow' : ''}`}
        style={{ background: isConnected ? color : '#4b5563' }}
      />
      {name}
      {isConnected ? (
        <Wifi className="w-3 h-3 ml-0.5" />
      ) : (
        <WifiOff className="w-3 h-3 ml-0.5" />
      )}
    </div>
  );
}
