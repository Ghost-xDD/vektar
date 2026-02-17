import { Zap, Timer, ExternalLink } from 'lucide-react';
import { LtvGauge } from './components/LtvGauge';
import { OrderBookChart } from './components/OrderBookChart';
import { HealthFactor } from './components/HealthFactor';
import { PositionCard } from './components/PositionCard';
import { ActivityFeed } from './components/ActivityFeed';
import { NetworkBadge } from './components/NetworkBadge';
import { MetricCard } from './components/MetricCard';
import { INITIAL_MARKET, INITIAL_POSITION } from './lib/mock-data';
import { useMarketLTV } from './hooks/useMarketLTV';
import { usePosition } from './hooks/usePosition';
import { useOrderBook, type OrderBookLevel } from './hooks/useOrderBook';
import { useActivityEvents, type ActivityEvent } from './hooks/useActivityEvents';

export default function App() {
  // Real blockchain data
  const { data: ltvData, isLoading: ltvLoading, error: ltvError } = useMarketLTV();
  const { data: positionData, isLoading: positionLoading } = usePosition();
  const { data: orderBookData, isLoading: orderBookLoading } = useOrderBook();
  const { data: eventsData = [] as ActivityEvent[] } = useActivityEvents();
  
  // Use mock data for static display values
  const market = INITIAL_MARKET;
  const position = INITIAL_POSITION;
  
  // Calculate real-time values
  const hasRealData = !ltvLoading && !!ltvData;
  const realSpotPrice = orderBookData?.bids?.[0]?.price || market.spotPrice;
  const realShares = positionData ? Number(positionData.collateralAmount) / 1e18 : position.collateralShares;
  const realDebt = positionData ? Number(positionData.debtAmount) / 1e6 : position.debtUsd;
  const collateralValue = realShares * realSpotPrice;
  
  // LTV-based calculations
  const dynamicLtvPercent = ltvData?.dynamicLtvPercent || 0;
  const maxBorrowDynamic = collateralValue * (dynamicLtvPercent / 100);
  const maxBorrowStatic = collateralValue * 0.75;

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-50 bg-bg/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                {hasRealData && (
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-bg animate-pulse" />
                )}
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight">
                  <span className="text-white">VEKTAR</span>
                  <span className="text-white/30 font-normal ml-1.5">Dynamic LTV Engine</span>
                </h1>
              </div>
            </div>

            {/* Network Status */}
            <div className="hidden sm:flex items-center gap-2">
              <NetworkBadge name="Base Sepolia" color="#0052ff" isConnected={hasRealData} />
              <NetworkBadge name="Polygon Amoy" color="#7b3fe4" isConnected={!!positionData} />
              <NetworkBadge name="Polymarket CLOB" color="#22d3ee" isConnected={!!orderBookData} />
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-3">
              {ltvLoading ? (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Timer className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </div>
              ) : hasRealData ? (
                <div className="flex items-center gap-2 text-xs text-green-400/60">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span>Live Data</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <div className="w-2 h-2 rounded-full bg-white/20" />
                  <span>Waiting for CRE...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Market Banner */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-bright bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                  Polymarket
                </span>
                <span className="text-[10px] text-white/30">{market.volume} volume</span>
              </div>
              <h2 className="text-lg sm:text-xl font-semibold text-white/90 leading-snug">
                {market.questionTitle}
              </h2>
              <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                <span>Spot: <span className="text-white/70 font-mono">
                  ${realSpotPrice.toFixed(2)}
                </span></span>
                <span>Shares: <span className="text-white/70 font-mono">
                  {realShares.toLocaleString()}
                </span></span>
                <span>Collateral: <span className="text-white/70 font-mono">
                  ${collateralValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                </span></span>
              </div>
            </div>

            {/* Link to Polymarket */}
            <div className="flex items-center gap-2">
              <a
                href="https://polymarket.com/event/what-price-will-bitcoin-hit-before-2027"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/80 text-xs font-medium transition-colors border border-white/10"
              >
                <ExternalLink className="w-3 h-3" />
                View on Polymarket
              </a>
            </div>
          </div>

          {/* Subtle gradient bg */}
          <div className="absolute inset-0 bg-gradient-to-r from-accent/[0.03] to-purple-600/[0.03] pointer-events-none" />
        </div>

        {/* LTV Comparison + Order Book */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LTV Gauges */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white/70">LTV Comparison</h3>
              {hasRealData && dynamicLtvPercent > 0 && dynamicLtvPercent < 75 && (
                <span className="text-[10px] text-yellow-400/80 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
                  Dynamic {(75 - dynamicLtvPercent).toFixed(1)}% safer
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-6 sm:gap-12">
              <LtvGauge
                label="STATIC"
                value={75}
                maxBorrow={maxBorrowStatic}
                isStatic={true}
                isActive={true}
              />
              <LtvGauge
                label="DYNAMIC"
                value={dynamicLtvPercent}
                maxBorrow={maxBorrowDynamic}
                isStatic={false}
                isActive={hasRealData}
              />
            </div>
            
            {/* Blockchain connection status */}
            {ltvLoading && (
              <div className="mt-3 text-center text-xs text-white/40">
                Loading blockchain data...
              </div>
            )}
            {ltvError && (
              <div className="mt-3 text-center text-xs text-red-400/80">
                ⚠️ Error connecting to Base Sepolia
              </div>
            )}
            {hasRealData && (
              <div className="mt-3 text-center text-xs text-green-400/60">
                ✓ Live data from Base Sepolia • Updates every 12s
              </div>
            )}

            {/* Bad debt warning when no CRE running */}
            {!hasRealData && (
              <div className="mt-4 bg-red-500/5 border border-red-500/15 rounded-lg p-3 text-center">
                <p className="text-xs text-red-400/80">
                  Static LTV allows <span className="font-mono font-semibold">${maxBorrowStatic.toLocaleString()}</span> borrowing
                  — real exit liquidity may be far lower
                </p>
              </div>
            )}

            {/* Liquidatable warning */}
            {positionData?.liquidatable && (
              <div className="mt-4 bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-center animate-flash-red">
                <p className="text-xs text-red-400">
                  ⚠️ Position underwater — CRE marked as LIQUIDATABLE
                </p>
              </div>
            )}
          </div>

          {/* Order Book */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white/70">Order Book Depth</h3>
              {orderBookData && (
                <span className="text-[10px] text-cyan-400/60 bg-cyan-400/10 px-2 py-0.5 rounded-full border border-cyan-400/20">
                  Live from Polymarket
                </span>
              )}
            </div>
            <OrderBookChart 
              levels={(orderBookData?.bids ?? []) as OrderBookLevel[]} 
              isActive={!!orderBookData} 
            />
            {orderBookLoading && (
              <div className="mt-2 text-center text-xs text-white/40">
                Fetching order book...
              </div>
            )}
            {orderBookData && orderBookData.totalBidDepth !== undefined && (
              <div className="mt-2 text-center text-xs text-cyan-400/60">
                ✓ ${orderBookData.totalBidDepth.toLocaleString()} total bid depth
              </div>
            )}
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Max Borrow (Static)"
            value={`$${maxBorrowStatic.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
            subValue="75% LTV (hardcoded)"
            color="#6b7280"
            isActive={true}
          />
          <MetricCard
            label="Max Borrow (Dynamic)"
            value={`$${maxBorrowDynamic.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
            subValue={`${dynamicLtvPercent.toFixed(1)}% LTV (live)`}
            color="#6366f1"
            isActive={hasRealData}
          />
          <MetricCard
            label="Total Bid Depth"
            value={`$${(orderBookData?.totalBidDepth ?? 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
            subValue={`${(orderBookData?.bids ?? []).length} price levels`}
            color="#22d3ee"
            isActive={!!orderBookData}
          />
          <MetricCard
            label="Current Debt"
            value={`$${realDebt.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
            subValue={positionData ? `Health: ${positionData.healthFactor.toFixed(2)}` : 'No position'}
            color={positionData?.healthFactor && positionData.healthFactor > 1 ? '#10b981' : '#ef4444'}
            isActive={!!positionData}
          />
        </div>

        {/* Health Factor + Position + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Health + Position */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <HealthFactor 
                value={positionData?.healthFactor ?? 0} 
                isActive={!!positionData} 
              />
              {positionLoading && (
                <div className="mt-2 text-center text-xs text-white/40">
                  Loading position data...
                </div>
              )}
              {positionData && (
                <div className="mt-2 text-center text-xs text-green-400/60">
                  ✓ Cross-chain data (Base + Polygon)
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <PositionCard
                position={{
                  user: '0x311e...2308',
                  collateralShares: realShares,
                  collateralValueUsd: collateralValue,
                  debtUsd: realDebt,
                  healthFactor: positionData?.healthFactor ?? 0,
                  status: positionData?.liquidatable ? 'liquidatable' : 'active',
                  polygonAddress: positionData?.polygonAddress ?? '0x518316DA...35517E6',
                  baseAddress: '0x82495884...B3edB0'
                }}
                isActive={!!positionData}
                collateralValueUsd={collateralValue}
              />
            </div>
          </div>

          {/* Activity Feed */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white/70">Activity Feed</h3>
              {eventsData.length > 0 && (
                <span className="text-[10px] text-white/30 font-mono">{eventsData.length} events</span>
              )}
            </div>
            <ActivityFeed events={eventsData} />
            {eventsData.length > 0 && (
              <div className="mt-3 text-center text-xs text-green-400/60">
                ✓ Live events from Base Sepolia
              </div>
            )}
            {eventsData.length === 0 && !hasRealData && (
              <div className="flex items-center justify-center py-12 text-white/30 text-xs">
                Waiting for CRE workflow to write transactions...
              </div>
            )}
          </div>
        </div>

        {/* Architecture Banner */}
        <div className="rounded-xl border border-border bg-surface p-6 overflow-hidden relative">
          <h3 className="text-sm font-medium text-white/70 mb-4">Cross-Chain Architecture</h3>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0">
            {/* Polygon */}
            <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-[#7b3fe4]/5 border border-[#7b3fe4]/15 min-w-[180px]">
              <div className="w-8 h-8 rounded-full bg-[#7b3fe4]/20 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-[#7b3fe4]" />
              </div>
              <span className="text-xs font-semibold text-[#7b3fe4]">Polygon Amoy</span>
              <span className="text-[10px] text-white/40">Collateral Escrow</span>
              <span className="text-[10px] text-white/30 font-mono">CTF ERC-1155 Shares</span>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex flex-col items-center gap-1 px-4">
              <div className="text-[10px] text-white/30">EVM Read</div>
              <div className="w-16 h-px bg-gradient-to-r from-[#7b3fe4]/40 to-accent/40" />
              <svg className="w-4 h-4 text-white/20 rotate-90 sm:rotate-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>

            {/* CRE */}
            <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-accent/5 border border-accent/15 min-w-[180px]">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-accent-bright" />
              </div>
              <span className="text-xs font-semibold text-accent-bright">CRE Workflow</span>
              <span className="text-[10px] text-white/40">BFT Consensus</span>
              <span className="text-[10px] text-white/30 font-mono">Dual Triggers (Cron + Event)</span>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex flex-col items-center gap-1 px-4">
              <div className="text-[10px] text-white/30">EVM Write</div>
              <div className="w-16 h-px bg-gradient-to-r from-accent/40 to-[#0052ff]/40" />
              <svg className="w-4 h-4 text-white/20 rotate-90 sm:rotate-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>

            {/* Base */}
            <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-[#0052ff]/5 border border-[#0052ff]/15 min-w-[180px]">
              <div className="w-8 h-8 rounded-full bg-[#0052ff]/20 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-[#0052ff]" />
              </div>
              <span className="text-xs font-semibold text-[#0052ff]">Base Sepolia</span>
              <span className="text-[10px] text-white/40">HorizonVault</span>
              <span className="text-[10px] text-white/30 font-mono">LTV + Liquidation + Settlement</span>
            </div>
          </div>

          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#7b3fe4]/[0.02] via-accent/[0.02] to-[#0052ff]/[0.02] pointer-events-none" />
        </div>

        {/* Footer */}
        <footer className="text-center py-6 text-xs text-white/20 space-y-1">
          <p>Event Horizon — Prediction Market Derivative Settlement Infrastructure</p>
          <p>Built with CRE (Chainlink Runtime Environment) | Team Cyph</p>
        </footer>
      </main>
    </div>
  );
}
