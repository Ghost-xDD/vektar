import { useQuery } from '@tanstack/react-query';
import { parseAbiItem } from 'viem';
import { baseClient, polygonClient } from '../lib/clients';
import { isLightRpcMode } from '../lib/rpc-mode';

const VAULT_ADDRESS = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;
const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS as `0x${string}`;
const TOKEN_ID = BigInt(import.meta.env.VITE_TOKEN_ID);

export type ActivityEventType = 'oracle_update' | 'early_exit' | 'final_settlement';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  description: string;
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp?: Date;
  tenderlyUrl: string;
  outcome?: number;
  user?: `0x${string}`;
  polygonTxHash?: `0x${string}`;
  polygonTenderlyUrl?: string;
}

const BASE_VNET = '2e625465-6c0e-4577-b01f-790eb8000996';
const POLYGON_VNET = '4ad68571-6a73-406b-ad62-a169a4593612';

const baseTenderlyUrl = (hash: `0x${string}`) =>
  `https://dashboard.tenderly.co/explorer/vnet/${BASE_VNET}/tx/${hash}`;
const polygonTenderlyUrl = (hash: `0x${string}`) =>
  `https://dashboard.tenderly.co/explorer/vnet/${POLYGON_VNET}/tx/${hash}`;

export function useActivityEvents() {
  return useQuery<ActivityEvent[]>({
    queryKey: ['events', TOKEN_ID.toString()],
    queryFn: async () => {
      try {
        const baseCurrentBlock = await baseClient.getBlockNumber();
        const baseFromBlock = baseCurrentBlock > 300n ? baseCurrentBlock - 300n : 0n;
        const polygonCurrentBlock = await polygonClient.getBlockNumber();
        const polygonFromBlock = polygonCurrentBlock > 300n ? polygonCurrentBlock - 300n : 0n;

        const [oracleUpdates, earlyExits, finalSettlements, polygonReleases] = await Promise.all([
          baseClient.getLogs({
            address: VAULT_ADDRESS,
            event: parseAbiItem(
              'event SettlementValueUpdated(uint256 indexed tokenId, uint256 oldValue, uint256 newValue)'
            ),
            args: { tokenId: TOKEN_ID },
            fromBlock: baseFromBlock,
            toBlock: 'latest'
          }),
          baseClient.getLogs({
            address: VAULT_ADDRESS,
            event: parseAbiItem(
              'event EarlyExitExecuted(address indexed user, uint256 indexed tokenId, uint256 payout)'
            ),
            args: { tokenId: TOKEN_ID },
            fromBlock: baseFromBlock,
            toBlock: 'latest'
          }),
          baseClient.getLogs({
            address: VAULT_ADDRESS,
            event: parseAbiItem(
              'event FinalSettlement(address indexed user, uint256 indexed tokenId, uint8 outcome, uint256 poolPayout)'
            ),
            args: { tokenId: TOKEN_ID },
            fromBlock: baseFromBlock,
            toBlock: 'latest'
          }),
          polygonClient.getLogs({
            address: ESCROW_ADDRESS,
            event: parseAbiItem(
              'event CollateralReleasedOnSettlement(address indexed user, uint256 indexed tokenId, uint256 amount, uint8 outcome)'
            ),
            args: { tokenId: TOKEN_ID },
            fromBlock: polygonFromBlock,
            toBlock: 'latest'
          })
        ]);

        // Avoid per-block timestamp RPC fanout; UI already shows tx hash and type.
        const timestamps = new Map<bigint, Date>();

        const OUTCOME_LABEL: Record<number, string> = { 0: 'NO', 1: 'YES', 2: 'INVALID' };
        const polygonReleaseQueues = new Map<string, Array<{ txHash: `0x${string}` }>>();
        for (const log of polygonReleases) {
          const args = log.args as { user?: `0x${string}`; outcome?: number };
          const key = `${(args.user ?? '').toLowerCase()}-${Number(args.outcome ?? 0)}`;
          const existing = polygonReleaseQueues.get(key) ?? [];
          existing.push({ txHash: log.transactionHash! });
          polygonReleaseQueues.set(key, existing);
        }

        const events: ActivityEvent[] = [
          ...finalSettlements.map((log) => {
            const args = log.args as { outcome?: number; user?: `0x${string}` };
            const outcome = Number(args.outcome ?? 0);
            const user = args.user;
            const key = `${(user ?? '').toLowerCase()}-${outcome}`;
            const pairedPolygonRelease = polygonReleaseQueues.get(key)?.shift();
            return {
              id: `${log.transactionHash}-${log.logIndex}`,
              type: 'final_settlement' as const,
              description: `Final settlement: ${OUTCOME_LABEL[outcome] ?? outcome}`,
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
              timestamp: timestamps.get(log.blockNumber!),
              tenderlyUrl: baseTenderlyUrl(log.transactionHash!),
              outcome,
              user,
              polygonTxHash: pairedPolygonRelease?.txHash,
              polygonTenderlyUrl: pairedPolygonRelease
                ? polygonTenderlyUrl(pairedPolygonRelease.txHash)
                : undefined
            };
          }),
          ...oracleUpdates.map((log) => {
            const oArgs = log.args as { newValue?: bigint; oldValue?: bigint };
            const newVal = Number(oArgs.newValue ?? 0n) / 1e6;
            const oldVal = Number(oArgs.oldValue ?? 0n) / 1e6;
            return {
              id: `${log.transactionHash}-${log.logIndex}`,
              type: 'oracle_update' as const,
              description:
                oldVal > 0
                  ? `Oracle: $${newVal.toFixed(4)}/share (was $${oldVal.toFixed(4)})`
                  : `Oracle: $${newVal.toFixed(4)}/share (first update)`,
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
              timestamp: timestamps.get(log.blockNumber!),
              tenderlyUrl: baseTenderlyUrl(log.transactionHash!)
            };
          }),
          ...earlyExits.map((log) => {
            const eArgs = log.args as { payout?: bigint; user?: `0x${string}` };
            const payout = Number(eArgs.payout ?? 0n) / 1e6;
            return {
              id: `${log.transactionHash}-${log.logIndex}`,
              type: 'early_exit' as const,
              description: `Early exit: $${payout.toFixed(2)} USDC → private payout routing`,
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
              timestamp: timestamps.get(log.blockNumber!),
              tenderlyUrl: baseTenderlyUrl(log.transactionHash!),
              user: eArgs.user
            };
          })
        ];

        return events.sort((a, b) => Number(b.blockNumber - a.blockNumber));
      } catch (err) {
        console.error('Error fetching activity events:', err);
        return [];
      }
    },
    refetchInterval: isLightRpcMode ? false : 60000,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2
  });
}
