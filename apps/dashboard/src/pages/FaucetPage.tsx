import { Droplets, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFaucet, type ClaimStatus } from '../hooks/useFaucet';
import { useWallet } from '../hooks/useWallet';
import { WalletButton } from '../components/WalletButton';

const USER_ADDRESS = import.meta.env.VITE_USER_ADDRESS as `0x${string}`;

interface ClaimRowProps {
  label: string;
  description: string;
  amount: string;
  symbol: string;
  status: ClaimStatus;
  error: string | null;
  disabled: boolean;
  onClick: () => void;
}

function ClaimRow({ label, description, amount, symbol, status, error, disabled, onClick }: ClaimRowProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 transition-colors">
      <div>
        <p className="text-sm font-semibold text-zinc-900">{label}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
        {error && (
          <div className="flex items-center gap-1 mt-1.5">
            <AlertCircle className="w-3 h-3 text-red-500" />
            <p className="text-[10px] text-red-500">{error}</p>
          </div>
        )}
      </div>

      <button
        onClick={onClick}
        disabled={disabled || status === 'pending'}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all min-w-[130px] justify-center ${
          status === 'done'
            ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
            : status === 'error'
            ? 'bg-red-50 text-red-600 border border-red-200 cursor-default'
            : disabled
            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
            : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm'
        }`}
      >
        {status === 'pending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {status === 'done'    && <CheckCircle2 className="w-3.5 h-3.5" />}
        <span>
          {status === 'done'    ? 'Claimed!'
           : status === 'pending' ? 'Sending...'
           : `Claim ${amount} ${symbol}`}
        </span>
      </button>
    </div>
  );
}

export function FaucetPage() {
  const { address, isCorrectChain } = useWallet();
  const {
    claimEth, claimUsdc, seedVault,
    ethStatus, usdcStatus, seedStatus,
    ethError, usdcError, seedError,
    hasKey, hasOpKey,
  } = useFaucet();

  const target = address ?? USER_ADDRESS;
  const canClaim = !!address && isCorrectChain && hasKey;

  return (
    <div className="min-h-screen w-full relative bg-white">
      {/* Orange glow */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at top center, rgba(255,140,60,0.4), transparent 65%)`,
          filter: 'blur(80px)'
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-zinc-200/80">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to dashboard
            </Link>
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Title */}
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center shadow-sm">
              <Droplets className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <h1 className="text-xl font-bold text-zinc-900">Testnet Faucet</h1>
          </div>
          <p className="text-sm text-zinc-500 pl-12">
            Fund your wallet on the Base Tenderly fork — no signatures needed.
          </p>
        </div>

        {/* Missing access key warning */}
        {!hasKey && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-800">Tenderly access key required</p>
            <p className="text-xs text-amber-700">
              Admin RPC methods are blocked on the public endpoint. Add your key to{' '}
              <code className="bg-amber-100 px-1 rounded">.env.local</code>:
            </p>
            <pre className="text-[11px] bg-amber-100 rounded-lg p-2.5 text-amber-900 overflow-x-auto">
              VITE_TENDERLY_ACCESS_KEY=your_key_here
            </pre>
            <a
              href="https://dashboard.tenderly.co/account/authorization"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900"
            >
              Get your access key → dashboard.tenderly.co/account/authorization
            </a>
          </div>
        )}

        {/* Chain warning */}
        {address && !isCorrectChain && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            Switch MetaMask to <span className="font-semibold">Base (Tenderly Fork)</span> to claim.
          </div>
        )}

        {/* Target address */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 space-y-0.5">
          <p className="text-[11px] text-zinc-400 uppercase tracking-wide font-medium">Funding address</p>
          <p className="text-sm font-mono text-zinc-800">{target}</p>
          {!address && (
            <p className="text-[11px] text-zinc-400">
              Connect wallet to fund your own address, or this will fund the demo address.
            </p>
          )}
        </div>

        {/* Claim buttons — Base Tenderly Fork */}
        <div className="space-y-3">
          <ClaimRow
            label="ETH"
            description="Gas for transactions on Base fork"
            amount="1"
            symbol="ETH"
            status={ethStatus}
            error={ethError}
            disabled={!canClaim}
            onClick={() => claimEth(target)}
          />
          <ClaimRow
            label="USDC"
            description="Settlement pool balance — required for earlyExit() payouts"
            amount="10,000"
            symbol="USDC"
            status={usdcStatus}
            error={usdcError}
            disabled={!canClaim}
            onClick={() => claimUsdc(target)}
          />
        </div>

        {/* Convergence vault section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
              Convergence Private Vault
            </p>
          </div>

          {!hasOpKey && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-amber-800">Operator key required</p>
              <p className="text-xs text-amber-700">
                Add to <code className="bg-amber-100 px-1 rounded">.env.local</code>:
              </p>
              <pre className="text-[11px] bg-amber-100 rounded-lg p-2.5 text-amber-900 overflow-x-auto">
                VITE_OPERATOR_KEY=0x...{'\n'}VITE_SEPOLIA_RPC=https://eth-sepolia...
              </pre>
            </div>
          )}

          <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 transition-colors">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Seed Vault</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Approve + deposit 20 LINK into the Convergence vault on Sepolia
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Operator: {import.meta.env.VITE_OPERATOR_KEY
                  ? `${import.meta.env.VITE_OPERATOR_KEY.slice(0, 8)}...`
                  : 'not set'}
              </p>
              {seedError && (
                <div className="flex items-center gap-1 mt-1.5">
                  <AlertCircle className="w-3 h-3 text-red-500" />
                  <p className="text-[10px] text-red-500">{seedError}</p>
                </div>
              )}
            </div>

            <button
              onClick={seedVault}
              disabled={!hasOpKey || seedStatus === 'approving' || seedStatus === 'depositing'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all min-w-[150px] justify-center ${
                seedStatus === 'done'
                  ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
                  : seedStatus === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200 cursor-default'
                  : !hasOpKey
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
                  : 'bg-emerald-900 hover:bg-emerald-800 text-white shadow-sm'
              }`}
            >
              {(seedStatus === 'approving' || seedStatus === 'depositing' || seedStatus === 'pending') && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {seedStatus === 'done'      && <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>
                {seedStatus === 'pending'    ? 'Funding operator…'
                 : seedStatus === 'approving'  ? 'Approving LINK…'
                 : seedStatus === 'depositing' ? 'Depositing…'
                 : seedStatus === 'done'       ? 'Seeded!'
                 : 'Seed 20 LINK'}
              </span>
            </button>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">How it works</p>
          <div className="space-y-2 text-xs text-zinc-500 leading-relaxed">
            <div className="flex gap-3">
              <code className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 shrink-0 self-start mt-0.5">
                tenderly_setBalance
              </code>
              <span>Directly sets the ETH balance on the fork. Bypasses mining — instant.</span>
            </div>
            <div className="flex gap-3">
              <code className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 shrink-0 self-start mt-0.5">
                tenderly_setErc20Balance
              </code>
              <span>Mints USDC to your address on the fork. The SettlementVault pool draws from this when earlyExit() is called.</span>
            </div>
            <div className="flex gap-3">
              <code className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 shrink-0 self-start mt-0.5">
                approve + deposit
              </code>
              <span>Approves the Convergence vault and deposits 20 LINK on Sepolia using the operator key. Required for private payout transfers in Handler 3.</span>
            </div>
          </div>
        </div>

        {!address && (
          <div className="flex justify-center">
            <WalletButton />
          </div>
        )}
      </main>
    </div>
  );
}
