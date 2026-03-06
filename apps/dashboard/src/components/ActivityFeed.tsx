import { ExternalLink, TrendingDown, LogOut, CheckCircle2, Activity } from 'lucide-react';
import type { ActivityEvent } from '../hooks/useActivityEvents';

interface ActivityFeedProps {
  events: ActivityEvent[];
}

function getEventIcon(type: string) {
  switch (type) {
    case 'oracle_update':
      return <TrendingDown className="w-3.5 h-3.5 text-orange-500" />;
    case 'early_exit':
      return <LogOut className="w-3.5 h-3.5 text-indigo-500" />;
    case 'final_settlement':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-zinc-400" />;
  }
}

function getEventBorder(type: string): string {
  switch (type) {
    case 'oracle_update':   return 'border-l-orange-300';
    case 'early_exit':      return 'border-l-indigo-300';
    case 'final_settlement': return 'border-l-green-300';
    default:                return 'border-l-zinc-200';
  }
}

function formatTime(date?: Date): string {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-400 text-xs gap-2">
        <Activity className="w-5 h-5 text-zinc-300" />
        <span>Waiting for CRE workflow to write transactions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 max-h-[320px] overflow-y-auto pr-1">
      {events.map((event, i) => (
        <div
          key={event.id}
          className={`flex items-start gap-3 px-3 py-2.5 rounded-md border-l-2 ${getEventBorder(event.type)} hover:bg-zinc-50 transition-colors ${
            i === 0 ? 'animate-slide-up' : ''
          }`}
        >
          <div className="mt-0.5 shrink-0">{getEventIcon(event.type)}</div>

          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-zinc-700 leading-snug">{event.description}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {event.timestamp && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  {formatTime(event.timestamp)}
                </span>
              )}
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${
                  event.type === 'oracle_update'
                    ? 'bg-orange-50 text-orange-500'
                    : event.type === 'early_exit'
                    ? 'bg-indigo-50 text-indigo-500'
                    : 'bg-green-50 text-green-600'
                }`}
              >
                {event.type === 'oracle_update'
                  ? 'Oracle'
                  : event.type === 'early_exit'
                  ? 'Exit'
                  : 'Settlement'}
              </span>
            </div>
          </div>

          <a
            href={event.tenderlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors font-mono mt-0.5"
          >
            {event.txHash.slice(0, 6)}...
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      ))}
    </div>
  );
}
