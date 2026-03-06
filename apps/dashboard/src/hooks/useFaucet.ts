import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const ADMIN_RPC    = import.meta.env.VITE_BASE_TENDERLY_ADMIN_RPC as string;
const ACCESS_KEY   = import.meta.env.VITE_TENDERLY_ACCESS_KEY as string | undefined;
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS as string;

const OPERATOR_KEY = import.meta.env.VITE_OPERATOR_KEY as `0x${string}` | undefined;
const FUNDER_KEY   = import.meta.env.VITE_FUNDER_KEY  as `0x${string}` | undefined;
const SEPOLIA_RPC  = import.meta.env.VITE_SEPOLIA_RPC  as string | undefined;

// LINK on Ethereum Sepolia — the only token in the Convergence demo vault
const LINK_TOKEN        = '0x779877A7B0D9E8603169DdbD7836e478b4624789' as `0x${string}`;
const CONVERGENCE_VAULT = '0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13' as `0x${string}`;
const SEED_AMOUNT       = 20n * 10n ** 18n; // 20 LINK

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);
const VAULT_ABI = parseAbi([
  'function deposit(address token, uint256 amount)',
]);

const GAS_ETH = 10n ** 16n; // 0.01 ETH — enough for approve + deposit

const ETH_AMOUNT  = '0x' + (1n * 10n ** 18n).toString(16);     // 1 ETH
const USDC_AMOUNT = '0x' + (10_000n * 10n ** 6n).toString(16); // 10,000 USDC

async function adminRpc(method: string, params: unknown[]) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ACCESS_KEY) headers['X-Access-Key'] = ACCESS_KEY;

  const res = await fetch(ADMIN_RPC, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return json.result;
}

export type FaucetToken = 'eth' | 'usdc';
export type ClaimStatus = 'idle' | 'pending' | 'approving' | 'depositing' | 'done' | 'error';

export function useFaucet() {
  const queryClient = useQueryClient();
  const [ethStatus,  setEthStatus]  = useState<ClaimStatus>('idle');
  const [usdcStatus, setUsdcStatus] = useState<ClaimStatus>('idle');
  const [seedStatus, setSeedStatus] = useState<ClaimStatus>('idle');
  const [ethError,   setEthError]   = useState<string | null>(null);
  const [usdcError,  setUsdcError]  = useState<string | null>(null);
  const [seedError,  setSeedError]  = useState<string | null>(null);

  const hasKey     = !!ADMIN_RPC;
  const hasOpKey   = !!OPERATOR_KEY;

  const claimEth = async (address: `0x${string}`) => {
    setEthError(null);
    setEthStatus('pending');
    try {
      await adminRpc('tenderly_setBalance', [[address], ETH_AMOUNT]);
      setEthStatus('done');
      setTimeout(() => setEthStatus('idle'), 3000);
    } catch (err: unknown) {
      setEthError(err instanceof Error ? err.message : 'Failed');
      setEthStatus('error');
    }
  };

  const claimUsdc = async (address: `0x${string}`) => {
    setUsdcError(null);
    setUsdcStatus('pending');
    try {
      await adminRpc('tenderly_setErc20Balance', [USDC_ADDRESS, address, USDC_AMOUNT]);
      setUsdcStatus('done');
      queryClient.invalidateQueries({ queryKey: ['position'] });
      setTimeout(() => setUsdcStatus('idle'), 3000);
    } catch (err: unknown) {
      setUsdcError(err instanceof Error ? err.message : 'Failed');
      setUsdcStatus('error');
    }
  };

  const seedVault = async () => {
    if (!OPERATOR_KEY) {
      setSeedError('VITE_OPERATOR_KEY not set in .env.local');
      setSeedStatus('error');
      return;
    }
    setSeedError(null);

    try {
      const rpc       = SEPOLIA_RPC || 'https://rpc.sepolia.org';
      const transport = http(rpc);
      const publicClient = createPublicClient({ chain: sepolia, transport });

      const operator = privateKeyToAccount(OPERATOR_KEY);
      const operatorClient = createWalletClient({ chain: sepolia, transport, account: operator });

      // ── Step 1: fund the operator from funder key (ETH for gas + LINK to deposit) ──
      // Mirrors setup-private-vault.sh Step 2.
      if (FUNDER_KEY) {
        const funder = privateKeyToAccount(FUNDER_KEY);
        const funderClient = createWalletClient({ chain: sepolia, transport, account: funder });

        setSeedStatus('pending'); // "Funding operator…"

        // Send 0.01 ETH for gas
        const ethTx = await funderClient.sendTransaction({
          to: operator.address,
          value: GAS_ETH,
          account: funder,
          chain: sepolia,
        });
        await publicClient.waitForTransactionReceipt({ hash: ethTx });

        // Transfer 20 LINK to operator
        const linkTx = await funderClient.writeContract({
          address: LINK_TOKEN,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [operator.address, SEED_AMOUNT],
          account: funder,
        });
        await publicClient.waitForTransactionReceipt({ hash: linkTx });
      }

      // ── Step 2: operator approves vault ──────────────────────────────────────────
      setSeedStatus('approving');
      const approveTx = await operatorClient.writeContract({
        address: LINK_TOKEN,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONVERGENCE_VAULT, SEED_AMOUNT],
        account: operator,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      // ── Step 3: operator deposits 20 LINK into Convergence vault ─────────────────
      setSeedStatus('depositing');
      const depositTx = await operatorClient.writeContract({
        address: CONVERGENCE_VAULT,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [LINK_TOKEN, SEED_AMOUNT],
        account: operator,
      });
      await publicClient.waitForTransactionReceipt({ hash: depositTx });

      setSeedStatus('done');
      setTimeout(() => setSeedStatus('idle'), 5000);
    } catch (err: unknown) {
      setSeedError(err instanceof Error ? err.message : 'Vault seed failed');
      setSeedStatus('error');
    }
  };

  return {
    claimEth, claimUsdc, seedVault,
    ethStatus, usdcStatus, seedStatus,
    ethError, usdcError, seedError,
    hasKey, hasOpKey,
  };
}
