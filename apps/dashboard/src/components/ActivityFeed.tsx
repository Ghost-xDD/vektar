import { ExternalLink, TrendingDown, LogOut, CheckCircle2, Activity } from 'lucide-react';
import type { ActivityEvent } from '../hooks/useActivityEvents';
import { LOGOS } from '../lib/logos';

interface ActivityFeedProps {
  events: ActivityEvent[];
}

const BASE_VNET = '2e625465-6c0e-4577-b01f-790eb8000996';
const POLYGON_VNET = '4ad68571-6a73-406b-ad62-a169a4593612';

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
    case 'oracle_update':    return 'border-l-orange-300';
    case 'early_exit':       return 'border-l-indigo-300';
    case 'final_settlement': return 'border-l-green-400';
    default:                 return 'border-l-zinc-200';
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

function ChainPair() {
  return (
    <div className="flex items-center gap-1 mt-1">
      {/* Polygon */}
      <a
        href={`https://dashboard.tenderly.co/explorer/vnet/${POLYGON_VNET}/transactions`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#7b3fe4]/8 border border-[#7b3fe4]/20 hover:bg-[#7b3fe4]/15 transition-colors"
      >
        <img src={LOGOS.polygon} alt="Polygon" className="w-3 h-3 rounded-full object-contain" />
        <span className="text-[9px] font-medium text-[#7b3fe4]">Polygon</span>
      </a>

      {/* Arrow */}
      <svg className="w-3 h-3 text-green-400 shrink-0" viewBox="0 0 12 12" fill="currentColor">
        <path d="M5 2l4 4-4 4V7H2V5h3V2z" />
      </svg>

      {/* Base */}
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0052ff]/8 border border-[#0052ff]/20">
        <img src={LOGOS.base} alt="Base" className="w-3 h-3 rounded-full object-contain" />
        <span className="text-[9px] font-medium text-[#0052ff]">Base</span>
      </div>

      <span className="text-[9px] text-zinc-400 ml-0.5">cross-chain settlement</span>
    </div>
  );
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

            {/* Chain pair — only for final settlement */}
            {event.type === 'final_settlement' && <ChainPair />}

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
              {event.type === 'final_settlement' && event.outcome !== undefined && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    event.outcome === 1
                      ? 'bg-green-100 text-green-700'
                      : event.outcome === 2
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {event.outcome === 1 ? 'YES' : event.outcome === 2 ? 'INVALID' : 'NO'}
                </span>
              )}
            </div>
          </div>

          <a
            href={
              event.type === 'final_settlement'
                ? `https://dashboard.tenderly.co/explorer/vnet/${BASE_VNET}/tx/${event.txHash}`
                : event.tenderlyUrl
            }
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
