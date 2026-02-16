import type { ActivityEvent } from '../lib/mock-data';
import { shortenHash } from '../lib/mock-data';
import { ExternalLink, TrendingDown, AlertTriangle, CheckCircle, Play, Activity } from 'lucide-react';

interface ActivityFeedProps {
  events: ActivityEvent[];
}

function getEventIcon(type: ActivityEvent['type']) {
  switch (type) {
    case 'ltv_update':
      return <TrendingDown className="w-3.5 h-3.5 text-accent-bright" />;
    case 'liquidation':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
    case 'settlement':
      return <CheckCircle className="w-3.5 h-3.5 text-[#6366f1]" />;
    case 'workflow_start':
      return <Play className="w-3.5 h-3.5 text-green-400" />;
    case 'health_check':
      return <Activity className="w-3.5 h-3.5 text-white/30" />;
  }
}

function getEventColor(type: ActivityEvent['type']): string {
  switch (type) {
    case 'ltv_update': return 'border-l-indigo-500/50';
    case 'liquidation': return 'border-l-red-500/50';
    case 'settlement': return 'border-l-indigo-500/50';
    case 'workflow_start': return 'border-l-green-500/50';
    case 'health_check': return 'border-l-white/10';
  }
}

function getExplorerUrl(chain: 'base' | 'polygon', txHash: string): string {
  return chain === 'base'
    ? `https://sepolia.basescan.org/tx/${txHash}`
    : `https://amoy.polygonscan.com/tx/${txHash}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-white/20 text-sm">
        <span>Waiting for CRE workflow to start...</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 max-h-[320px] overflow-y-auto pr-1">
      {events.map((event, i) => (
        <div
          key={event.id}
          className={`flex items-start gap-3 px-3 py-2 rounded-md border-l-2 ${getEventColor(event.type)} hover:bg-white/[0.02] transition-colors ${
            i === 0 ? 'animate-slide-up' : ''
          }`}
        >
          {/* Icon */}
          <div className="mt-0.5 shrink-0">{getEventIcon(event.type)}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/70 truncate">{event.description}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-white/30 font-mono">
                {formatTime(event.timestamp)}
              </span>
              {event.chain && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{
                    color: event.chain === 'base' ? '#0052ff' : '#7b3fe4',
                    background: event.chain === 'base' ? 'rgba(0, 82, 255, 0.1)' : 'rgba(123, 63, 228, 0.1)',
                  }}
                >
                  {event.chain === 'base' ? 'Base' : 'Polygon'}
                </span>
              )}
            </div>
          </div>

          {/* Tx link */}
          {event.txHash && event.chain && (
            <a
              href={getExplorerUrl(event.chain, event.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-[10px] text-white/20 hover:text-white/50 transition-colors font-mono mt-0.5"
            >
              {shortenHash(event.txHash, 4)}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
