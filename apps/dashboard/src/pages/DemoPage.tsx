import { useDemoStore, type DemoScenario } from '../lib/demo-store';
import { useOrderBook, type OrderBookLevel } from '../hooks/useOrderBook';
import { OrderBookChart } from '../components/OrderBookChart';

const SCENARIOS: { value: DemoScenario; label: string; description: string }[] = [
  {
    value: 'normal',
    label: 'Normal',
    description: 'Real Polymarket order book · live VWAP',
  },
  {
    value: 'thin',
    label: 'Thin',
    description: '90% liquidity drained · prices hold',
  },
  {
    value: 'crisis',
    label: 'Crisis',
    description: '97% drained · 65% price decay · oracle collapses',
  },
];

const COLORS: Record<DemoScenario, { bg: string; border: string; text: string; dot: string }> = {
  normal: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  thin: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  crisis: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
};

export function DemoPage() {
  const { scenario, setScenario } = useDemoStore();
  const { data: orderBook } = useOrderBook() as {
    data: { bids: OrderBookLevel[]; totalBidDepth: number; timestamp: number } | undefined;
  };

  const colors = COLORS[scenario];
  const spotPrice = orderBook?.bids?.[0]?.price ?? 0;
  const totalDepth = orderBook?.totalBidDepth ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8 gap-8">
      {/* Scenario buttons */}
      <div className="flex gap-4">
        {SCENARIOS.map(({ value, label, description }) => {
          const active = scenario === value;
          const c = COLORS[value];
          return (
            <button
              key={value}
              onClick={() => setScenario(value)}
              className={`flex flex-col items-start gap-1 px-6 py-4 rounded-xl border-2 transition-all min-w-[180px] ${
                active
                  ? `${c.bg} ${c.border} ${c.text}`
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${active ? c.dot : 'bg-zinc-600'}`} />
                <span className="font-bold text-sm tracking-wide uppercase">{label}</span>
              </div>
              <span className="text-[11px] leading-snug opacity-70">{description}</span>
            </button>
          );
        })}
      </div>

      {/* Live stats */}
      <div className={`flex gap-8 px-6 py-3 rounded-xl border ${colors.border} ${colors.bg} ${colors.text}`}>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest opacity-60">Top bid</p>
          <p className="font-mono font-bold text-lg">${spotPrice.toFixed(3)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest opacity-60">Total depth</p>
          <p className="font-mono font-bold text-lg">
            ${totalDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest opacity-60">Mode</p>
          <p className="font-bold text-lg capitalize">{scenario}</p>
        </div>
      </div>

      {/* Order book chart */}
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <OrderBookChart
          levels={(orderBook?.bids ?? []) as OrderBookLevel[]}
          isActive={!!orderBook}
        />
      </div>

      <p className="text-[11px] text-zinc-600">
        /demo · hidden · changes are reflected on the main dashboard immediately
      </p>
    </div>
  );
}
