import { Zap, ExternalLink, BarChart2, Activity, Droplets } from 'lucide-react';
import { LOGOS } from './lib/logos';
import { Link } from 'react-router-dom';

const BASE_EXPLORER =
  'https://dashboard.tenderly.co/explorer/vnet/2e625465-6c0e-4577-b01f-790eb8000996';
const POLYGON_EXPLORER =
  'https://dashboard.tenderly.co/explorer/vnet/4ad68571-6a73-406b-ad62-a169a4593612';
const POLYMARKET_MARKET_TITLE = 'What price will Bitcoin hit in 2026?';
const POLYMARKET_TARGET_OUTCOME = '↑ 100,000';
import { useSettlementValue } from './hooks/useSettlementValue';
import { usePosition } from './hooks/usePosition';
import { useOrderBook, type OrderBookLevel } from './hooks/useOrderBook';
import { useMarketVolume } from './hooks/useMarketVolume';
import { useActivityEvents } from './hooks/useActivityEvents';
import { useEarlyExit } from './hooks/useEarlyExit';
import { useShieldedAddress } from './hooks/useShieldedAddress';
import { useRegisterPosition } from './hooks/useRegisterPosition';
import { useConvergenceBalance } from './hooks/useConvergenceBalance';
import { useEventWatcher } from './hooks/useEventWatcher';
import { useWallet } from './hooks/useWallet';
import { SettlementOracle } from './components/SettlementOracle';
import { OrderBookChart } from './components/OrderBookChart';
import { PositionCard } from './components/PositionCard';
import { EarlyExitButton } from './components/EarlyExitButton';
import { ShieldedAddressCard } from './components/ShieldedAddressCard';
import { ActivityFeed } from './components/ActivityFeed';
import { NetworkBadge } from './components/NetworkBadge';
import { WalletButton } from './components/WalletButton';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export default function App() {
  useEventWatcher();

  const wallet = useWallet();
  const { data: settlement, isLoading: settlementLoading } =
    useSettlementValue();
  const { data: position, isLoading: positionLoading } = usePosition(
    wallet.address,
  );
  const { data: marketVolume } = useMarketVolume();
  const { data: orderBook } = useOrderBook() as {
    data:
      | { bids: OrderBookLevel[]; totalBidDepth: number; timestamp: number }
      | undefined;
  };
  const { data: events = [] } = useActivityEvents();
  const earlyExit = useEarlyExit();
  const shieldedAddr = useShieldedAddress();
  const registerPosition = useRegisterPosition();
  const convergenceBalance = useConvergenceBalance();

  const spotPrice = orderBook?.bids?.[0]?.price ?? 0;
  const volume = marketVolume ?? 0;
  const volumeLabel =
    volume >= 1e6
      ? `$${(volume / 1e6).toFixed(1)}M`
      : volume >= 1e3
        ? `$${(volume / 1e3).toFixed(0)}k`
        : volume > 0
          ? `$${volume.toLocaleString()}`
          : '—';
  const normalizedWallet = wallet.address?.toLowerCase();
  const hasShares = (position?.shares ?? 0) > 0;
  const registeredShieldedAddress =
    position?.shieldedAddress && position.shieldedAddress !== ZERO_ADDR
      ? position.shieldedAddress
      : null;
  const isFinallySettled =
    !!normalizedWallet &&
    events.some(
      (e) => e.type === 'final_settlement' && e.user?.toLowerCase() === normalizedWallet
    );

  return (
    <div className="min-h-screen w-full relative bg-white">
      {/* Warm orange glow — top center */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: '#ffffff',
          backgroundImage: `radial-gradient(
            circle at top center,
            rgba(255, 140, 60, 0.5),
            transparent 70%
          )`,
          filter: 'blur(80px)',
          backgroundRepeat: 'no-repeat',
        }}
      />

      <header className="sticky top-0 z-40 shadow-sm backdrop-blur-xl border-b border-zinc-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
                  <Zap className="w-4 h-4 text-orange-400" />
                </div>
                {settlement?.isActive && (
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
                )}
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-zinc-900">
                  VEKTAR
                  <span className="text-zinc-400 font-normal ml-1.5 text-xs">
                    Settlement Oracle
                  </span>
                </h1>
              </div>
            </div>

            {/* Network badges */}
            <div className="hidden md:flex items-center gap-2">
              <NetworkBadge
                name="Base Fork"
                color="#0052ff"
                isConnected={!!settlement?.isActive}
                logoUrl={LOGOS.base}
              />
              <NetworkBadge
                name="Polygon Fork"
                color="#7b3fe4"
                isConnected={!!position?.hasPosition}
                logoUrl={LOGOS.polygon}
              />
              <NetworkBadge
                name="Polymarket CLOB"
                color="#f97316"
                isConnected={!!orderBook}
                logoUrl={LOGOS.polymarket}
              />
            </div>

            {/* Faucet link + Wallet */}
            <div className="flex items-center gap-3">
              <Link
                to="/faucet"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors border border-transparent hover:border-zinc-200"
              >
                <Droplets className="w-3.5 h-3.5" />
                Faucet
              </Link>
              <WalletButton />
            </div>
          </div>
        </div>
      </header>

      {/* Wrong chain banner */}
      {wallet.address && !wallet.isCorrectChain && (
        <div className="relative z-30 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center">
          <p className="text-sm text-amber-700 font-medium">
            MetaMask is on the wrong network.{' '}
            <button
              onClick={wallet.switchToBaseFork}
              className="underline underline-offset-2 hover:text-amber-900"
            >
              Switch to Base Tenderly Fork →
            </button>
          </p>
        </div>
      )}

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Market header */}
        <div className="rounded-2xl border-2 border-orange-200 bg-white/90 backdrop-blur-sm p-6 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-700 bg-orange-100 px-2.5 py-1 rounded-full border border-orange-200">
                  <img
                    src={LOGOS.polymarket}
                    alt=""
                    className="w-3 h-3 rounded object-contain"
                  />
                  Polymarket
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-zinc-900 text-white">
                  Official Market
                </span>
                <span className="text-[10px] text-zinc-400">
                  {volumeLabel} Vol.
                </span>
              </div>
              <h2 className="text-2xl sm:text-[1.7rem] font-extrabold text-zinc-950 leading-tight tracking-tight">
                {POLYMARKET_MARKET_TITLE}
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                Tracking outcome{' '}
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-900 text-white font-bold">
                  {POLYMARKET_TARGET_OUTCOME}
                </span>{' '}
                for this market.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-zinc-400">
                <span>
                  Spot:{' '}
                  <span className="font-mono text-zinc-700 font-medium">
                    {spotPrice > 0 ? `$${spotPrice.toFixed(3)}` : '—'}
                  </span>
                </span>
                <span>
                  Shares:{' '}
                  <span
                    className={`font-mono font-medium ${position?.settled ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}
                  >
                    {positionLoading
                      ? '...'
                      : position?.settled
                        ? '0'
                        : `${(position?.shares ?? 0) > 0 ? position!.shares : position?.lockedShares ?? 0} YES`}
                  </span>
                </span>
                <span>
                  User:{' '}
                  <span className="font-mono text-zinc-700 font-medium">
                    {(wallet.address ?? '0x0')?.slice(0, 8)}...
                  </span>
                </span>
              </div>
            </div>
            <a
              href="https://polymarket.com/event/what-price-will-bitcoin-hit-before-2027"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-xs text-zinc-500 hover:text-zinc-700 transition-all font-medium whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3" />
              View on Polymarket
            </a>
          </div>
        </div>

        {/* Main grid: Settlement Oracle + Order Book */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Settlement Oracle */}
          <div className="rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
            <SettlementOracle
              perShareUSDC={settlement?.perShareUSDC ?? 0}
              totalExitUSDC={settlement?.totalExitUSDC ?? 0}
              spotPrice={spotPrice}
              secondsSinceUpdate={settlement?.secondsSinceUpdate ?? 0}
              isStale={settlement?.isStale ?? false}
              isActive={settlement?.isActive ?? false}
              isLoading={settlementLoading}
            />
          </div>

          {/* Order Book — Settlement Signal */}
          <div className="rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-zinc-500" />
                <h3 className="text-sm font-semibold text-zinc-900">
                  Order Book Depth
                </h3>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
                  Settlement Signal
                </span>
              </div>
              {orderBook && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  $
                  {orderBook.totalBidDepth.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{' '}
                  depth
                </span>
              )}
            </div>
            <OrderBookChart
              levels={(orderBook?.bids ?? []) as OrderBookLevel[]}
              isActive={!!orderBook}
            />
            {orderBook && (
              <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
                This is the real exit liquidity. VWAP against these bids is what
                CRE uses to set settlement value. When the chart empties, the
                oracle collapses.
              </p>
            )}
          </div>
        </div>

        {/* Second row: Position + Early Exit + Shielded Address */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Position */}
          <div className="rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
            <PositionCard
              userAddress={wallet.address}
              shares={position?.shares ?? 0}
              settled={position?.settled ?? false}
              isFinallySettled={isFinallySettled}
              polygonAddress={position?.polygonAddress ?? null}
              shieldedAddress={position?.shieldedAddress ?? null}
              newShieldedAddress={shieldedAddr.shieldedAddress}
              lockedShares={position?.lockedShares ?? 0}
              hasPosition={position?.hasPosition ?? false}
              privatePayoutComplete={earlyExit.state === 'private_complete'}
              isLoading={positionLoading}
              isConnected={!!wallet.address}
              isCorrectChain={wallet.isCorrectChain}
            />
          </div>

          {/* Early Exit */}
          <div className="rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold text-zinc-900">
                Early Exit
              </h3>
              {settlement?.isActive && !settlement.isStale && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">
                  Oracle ready
                </span>
              )}
            </div>
            <EarlyExitButton
              state={earlyExit.state}
              txHash={earlyExit.txHash}
              paidOutUSDC={earlyExit.paidOutUSDC}
              totalExitUSDC={settlement?.totalExitUSDC ?? 0}
              error={earlyExit.error}
              isOracleActive={settlement?.isActive ?? false}
              isOracleStale={settlement?.isStale ?? false}
              isSettled={position?.settled ?? false}
              hasShares={hasShares}
              isConnected={!!wallet.address}
              isCorrectChain={wallet.isCorrectChain}
              onExecute={earlyExit.execute}
              onMarkComplete={() => earlyExit.markPrivateComplete()}
              onReset={() => {
                earlyExit.reset();
                convergenceBalance.reset();
              }}
              balanceState={convergenceBalance.state}
              balances={convergenceBalance.balances}
              balanceError={convergenceBalance.error}
              onFetchBalance={convergenceBalance.fetchBalance}
            />
          </div>

          {/* Shielded Address */}
          <div className="rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
            <ShieldedAddressCard
              shieldedAddress={shieldedAddr.shieldedAddress}
              generateState={shieldedAddr.state}
              generateError={shieldedAddr.error}
              registeredAddress={registeredShieldedAddress}
              hasShares={hasShares}
              registerState={registerPosition.state}
              registerError={registerPosition.error}
              onGenerate={shieldedAddr.generate}
              onRegister={() =>
                registerPosition.register(
                  shieldedAddr.shieldedAddress ??
                    registeredShieldedAddress ??
                    undefined,
                )
              }
            />
          </div>
        </div>

        {/* Activity Feed */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold text-zinc-900">
                Activity Feed
              </h3>
              <span className="text-[10px] text-zinc-400">
                Oracle · Exit · Settlement
              </span>
            </div>
            {events.length > 0 && (
              <span className="text-[10px] font-mono text-zinc-400">
                {events.length} events · last 2000 blocks
              </span>
            )}
          </div>
          <ActivityFeed events={events} />
        </div>

        {/* Architecture strip */}
        <div className="rounded-2xl border border-zinc-200 bg-white/70 backdrop-blur-sm p-6 shadow-sm overflow-hidden relative">
          <h3 className="text-sm font-semibold text-zinc-900 mb-5">
            Cross-Chain Architecture
          </h3>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0">
            {/* Polygon */}
            <a
              href={`${POLYGON_EXPLORER}/transactions`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-[#7b3fe4]/[0.04] border border-[#7b3fe4]/15 min-w-[160px] text-center hover:bg-[#7b3fe4]/[0.07] transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-[#7b3fe4]/10 flex items-center justify-center overflow-hidden">
                <img
                  src={LOGOS.polygon}
                  alt=""
                  className="w-5 h-5 object-contain"
                />
              </div>
              <span className="text-xs font-semibold text-[#7b3fe4]">
                Polygon
              </span>
              <span className="text-[10px] text-zinc-500">
                CollateralEscrow
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">
                CTF ERC-1155 Shares
              </span>
              <ExternalLink className="w-2.5 h-2.5 text-[#7b3fe4]/40 group-hover:text-[#7b3fe4]/70 transition-colors" />
            </a>

            {/* Arrow */}
            <div className="hidden sm:flex flex-col items-center gap-1 px-3">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wide">
                EVM Read
              </span>
              <div className="flex items-center gap-0.5">
                <div className="w-12 h-px bg-gradient-to-r from-[#7b3fe4]/30 to-orange-300/60" />
                <svg
                  className="w-3 h-3 text-orange-300"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M6 2l4 4-4 4V6H2V6h4V2z" />
                </svg>
              </div>
            </div>

            {/* CRE */}
            <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-orange-50/60 border border-orange-100 min-w-[160px] text-center">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                <Zap className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-xs font-semibold text-orange-600">
                CRE Workflow
              </span>
              <span className="text-[10px] text-zinc-500">BFT Consensus</span>
              <span className="text-[10px] text-zinc-400 font-mono">
                Cron + Event Triggers
              </span>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex flex-col items-center gap-1 px-3">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wide">
                EVM Write
              </span>
              <div className="flex items-center gap-0.5">
                <div className="w-12 h-px bg-gradient-to-r from-orange-300/60 to-[#0052ff]/30" />
                <svg
                  className="w-3 h-3 text-[#0052ff]/40"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M6 2l4 4-4 4V6H2V6h4V2z" />
                </svg>
              </div>
            </div>

            {/* Base */}
            <a
              href={`${BASE_EXPLORER}/transactions`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-[#0052ff]/[0.03] border border-[#0052ff]/10 min-w-[160px] text-center hover:bg-[#0052ff]/[0.06] transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-[#0052ff]/10 flex items-center justify-center overflow-hidden">
                <img
                  src={LOGOS.base}
                  alt=""
                  className="w-5 h-5 object-contain"
                />
              </div>
              <span className="text-xs font-semibold text-[#0052ff]">Base</span>
              <span className="text-[10px] text-zinc-500">SettlementVault</span>
              <span className="text-[10px] text-zinc-400 font-mono">
                Oracle · Exit · Payout
              </span>
              <ExternalLink className="w-2.5 h-2.5 text-[#0052ff]/40 group-hover:text-[#0052ff]/70 transition-colors" />
            </a>

            {/* Arrow */}
            <div className="hidden sm:flex flex-col items-center gap-1 px-3">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wide">
                Private
              </span>
              <div className="flex items-center gap-0.5">
                <div className="w-12 h-px bg-gradient-to-r from-[#0052ff]/30 to-emerald-300/60" />
                <svg
                  className="w-3 h-3 text-emerald-400"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M6 2l4 4-4 4V6H2V6h4V2z" />
                </svg>
              </div>
            </div>

            {/* Convergence */}
            <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-emerald-50/60 border border-emerald-100 min-w-[160px] text-center">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-emerald-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-emerald-700">
                Convergence
              </span>
              <span className="text-[10px] text-zinc-500">Private Vault</span>
              <span className="text-[10px] text-zinc-400 font-mono">
                Shielded payout
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center pb-6 text-xs text-zinc-400 space-y-1">
          <p>
            Event Horizon — Prediction Market Derivative Settlement
            Infrastructure
          </p>
          <p>Built with CRE (Chainlink Runtime Environment) · Team Cyph</p>
        </footer>
      </main>
    </div>
  );
}
