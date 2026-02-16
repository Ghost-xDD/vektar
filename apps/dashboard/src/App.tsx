import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, Zap, Timer, RotateCcw, ChevronDown } from 'lucide-react';
import { LtvGauge } from './components/LtvGauge';
import { OrderBookChart } from './components/OrderBookChart';
import { HealthFactor } from './components/HealthFactor';
import { PositionCard } from './components/PositionCard';
import { ActivityFeed } from './components/ActivityFeed';
import { NetworkBadge } from './components/NetworkBadge';
import { MetricCard } from './components/MetricCard';
import { getInitialState, runCycle, runSettlement, type SimState } from './lib/simulation';

const CYCLE_INTERVAL = 6000; // 6s for demo speed (real = 12s)

export default function App() {
  const [state, setState] = useState<SimState>(getInitialState);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSimulation = useCallback(() => {
    setState(prev => {
      const next = runCycle(prev);
      return next;
    });

    setCountdown(CYCLE_INTERVAL / 1000);

    // Start cycle interval
    intervalRef.current = setInterval(() => {
      setState(prev => {
        if (prev.phase === 'settled') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return prev;
        }
        return runCycle(prev);
      });
      setCountdown(CYCLE_INTERVAL / 1000);
    }, CYCLE_INTERVAL);

    // Countdown timer
    countdownRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
  }, []);

  const stopSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setState(prev => ({ ...prev, isRunning: false }));
    setCountdown(0);
  }, []);

  const resetSimulation = useCallback(() => {
    stopSimulation();
    setState(getInitialState());
  }, [stopSimulation]);

  const triggerSettlement = useCallback(() => {
    stopSimulation();
    setState(prev => runSettlement(prev));
  }, [stopSimulation]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const { market, position, orderBook, events, phase, cycle, isRunning } = state;
  const isActive = phase !== 'idle';

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
                {isRunning && (
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
              <NetworkBadge name="Base Sepolia" color="#0052ff" isConnected={isActive} />
              <NetworkBadge name="Polygon Amoy" color="#7b3fe4" isConnected={isActive} />
              <NetworkBadge name="Polymarket CLOB" color="#22d3ee" isConnected={isActive} />
            </div>

            {/* Cycle indicator */}
            <div className="flex items-center gap-3">
              {isRunning && (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Timer className="w-3.5 h-3.5" />
                  <span className="font-mono">Cycle {cycle}</span>
                  <span className="text-white/20">|</span>
                  <span className="font-mono tabular-nums">{countdown}s</span>
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
                <span>Spot: <span className="text-white/70 font-mono">${market.spotPrice.toFixed(2)}</span></span>
                <span>Shares: <span className="text-white/70 font-mono">{position.collateralShares.toLocaleString()}</span></span>
                {isActive && (
                  <span>TWOB Min: <span className="text-white/70 font-mono">${Math.round(market.twobMinLiquidity).toLocaleString()}</span></span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {!isRunning && phase !== 'settled' && (
                <button
                  onClick={startSimulation}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-dim text-white text-sm font-medium transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {cycle === 0 ? 'Start CRE' : 'Resume'}
                </button>
              )}
              {isRunning && (
                <button
                  onClick={stopSimulation}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  Pause
                </button>
              )}
              {isActive && phase !== 'settled' && (
                <button
                  onClick={triggerSettlement}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm font-medium transition-colors border border-purple-500/20"
                >
                  <ChevronDown className="w-4 h-4" />
                  Settle
                </button>
              )}
              {phase === 'settled' && (
                <button
                  onClick={resetSimulation}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              )}
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
              {isActive && market.dynamicLtv > 0 && market.dynamicLtv < market.staticLtv && (
                <span className="text-[10px] text-yellow-400/80 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
                  Dynamic LTV {Math.round(market.staticLtv - market.dynamicLtv)}% lower than static
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-6 sm:gap-12">
              <LtvGauge
                label="STATIC"
                value={market.staticLtv}
                maxBorrow={market.maxBorrowStatic}
                isStatic={true}
                isActive={true}
              />
              <LtvGauge
                label="DYNAMIC"
                value={market.dynamicLtv}
                maxBorrow={market.maxBorrowDynamic}
                isStatic={false}
                isActive={isActive}
              />
            </div>

            {/* Bad debt warning */}
            {!isActive && (
              <div className="mt-4 bg-red-500/5 border border-red-500/15 rounded-lg p-3 text-center">
                <p className="text-xs text-red-400/80">
                  Static LTV allows <span className="font-mono font-semibold">${market.maxBorrowStatic.toLocaleString()}</span> borrowing
                  — real exit liquidity may be far lower
                </p>
              </div>
            )}

            {isActive && position.status === 'liquidatable' && (
              <div className="mt-4 bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-center animate-flash-red">
                <p className="text-xs text-red-400">
                  Position underwater — CRE marked as LIQUIDATABLE
                </p>
              </div>
            )}
          </div>

          {/* Order Book */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <OrderBookChart levels={orderBook} isActive={isActive} />
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="VWAP"
            value={`$${market.vwap.toFixed(4)}`}
            subValue={`Spot: $${market.spotPrice.toFixed(2)}`}
            color={market.vwap > 0 ? '#818cf8' : '#4b5563'}
            isActive={isActive && market.vwap > 0}
          />
          <MetricCard
            label="Slippage Factor"
            value={`${(market.slippageFactor * 100).toFixed(1)}%`}
            subValue="VWAP / Spot Price"
            color={market.slippageFactor > 0.8 ? '#10b981' : market.slippageFactor > 0.5 ? '#f59e0b' : '#ef4444'}
            isActive={isActive && market.slippageFactor > 0}
          />
          <MetricCard
            label="Total Bid Depth"
            value={`$${Math.round(market.totalBidDepth).toLocaleString()}`}
            subValue={`${orderBook.length} price levels`}
            color="#22d3ee"
            isActive={isActive && market.totalBidDepth > 0}
          />
          <MetricCard
            label="TWOB Min"
            value={`$${Math.round(market.twobMinLiquidity).toLocaleString()}`}
            subValue="60s window minimum"
            color="#a78bfa"
            isActive={isActive && market.twobMinLiquidity > 0}
          />
        </div>

        {/* Health Factor + Position + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Health + Position */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <HealthFactor value={position.healthFactor} isActive={isActive} />
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <PositionCard
                position={position}
                isActive={isActive}
                collateralValueUsd={market.spotPrice * position.collateralShares}
              />
            </div>
          </div>

          {/* Activity Feed */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white/70">Activity Feed</h3>
              {events.length > 0 && (
                <span className="text-[10px] text-white/30 font-mono">{events.length} events</span>
              )}
            </div>
            <ActivityFeed events={events} />
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
