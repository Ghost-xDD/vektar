import { useQuery } from '@tanstack/react-query';
import { parseAbiItem } from 'viem';
import { baseClient } from '../lib/clients';

const VAULT_ADDRESS = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;
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
}

const BASE_VNET = '2e625465-6c0e-4577-b01f-790eb8000996';

const tenderlyUrl = (hash: `0x${string}`) =>
  `https://dashboard.tenderly.co/explorer/vnet/${BASE_VNET}/tx/${hash}`;

export function useActivityEvents() {
  return useQuery<ActivityEvent[]>({
    queryKey: ['events', TOKEN_ID.toString()],
    queryFn: async () => {
      try {
        const currentBlock = await baseClient.getBlockNumber();
        const fromBlock = currentBlock > 2000n ? currentBlock - 2000n : 0n;

        const [oracleUpdates, earlyExits, finalSettlements] = await Promise.all([
          baseClient.getLogs({
            address: VAULT_ADDRESS,
            event: parseAbiItem(
              'event SettlementValueUpdated(uint256 indexed tokenId, uint256 oldValue, uint256 newValue)'
            ),
            args: { tokenId: TOKEN_ID },
            fromBlock,
            toBlock: 'latest'
          }),
          baseClient.getLogs({
            address: VAULT_ADDRESS,
            event: parseAbiItem(
              'event EarlyExitExecuted(address indexed user, uint256 indexed tokenId, uint256 payout)'
            ),
            args: { tokenId: TOKEN_ID },
            fromBlock,
            toBlock: 'latest'
          }),
          baseClient.getLogs({
            address: VAULT_ADDRESS,
            event: parseAbiItem(
              'event FinalSettlement(address indexed user, uint256 indexed tokenId, uint8 outcome, uint256 poolPayout)'
            ),
            args: { tokenId: TOKEN_ID },
            fromBlock,
            toBlock: 'latest'
          })
        ]);

        // Collect unique block numbers to fetch timestamps
        const blockNums = new Set([
          ...oracleUpdates.map((l) => l.blockNumber!),
          ...earlyExits.map((l) => l.blockNumber!),
          ...finalSettlements.map((l) => l.blockNumber!)
        ]);
        const timestamps = new Map<bigint, Date>();
        await Promise.all(
          Array.from(blockNums).map(async (bn) => {
            try {
              const block = await baseClient.getBlock({ blockNumber: bn });
              timestamps.set(bn, new Date(Number(block.timestamp) * 1000));
            } catch {
              timestamps.set(bn, new Date());
            }
          })
        );

        const OUTCOME_LABEL: Record<number, string> = { 0: 'NO', 1: 'YES', 2: 'INVALID' };

        const events: ActivityEvent[] = [
          ...finalSettlements.map((log) => {
            const args = log.args as { outcome?: number };
            const outcome = Number(args.outcome ?? 0);
            return {
              id: `${log.transactionHash}-${log.logIndex}`,
              type: 'final_settlement' as const,
              description: `Final settlement: ${OUTCOME_LABEL[outcome] ?? outcome}`,
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
              timestamp: timestamps.get(log.blockNumber!),
              tenderlyUrl: tenderlyUrl(log.transactionHash!),
              outcome
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
              tenderlyUrl: tenderlyUrl(log.transactionHash!)
            };
          }),
          ...earlyExits.map((log) => {
            const eArgs = log.args as { payout?: bigint };
            const payout = Number(eArgs.payout ?? 0n) / 1e6;
            return {
              id: `${log.transactionHash}-${log.logIndex}`,
              type: 'early_exit' as const,
              description: `Early exit: $${payout.toFixed(2)} USDC → private payout routing`,
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
              timestamp: timestamps.get(log.blockNumber!),
              tenderlyUrl: tenderlyUrl(log.transactionHash!)
            };
          })
        ];

        return events.sort((a, b) => Number(b.blockNumber - a.blockNumber));
      } catch (err) {
        console.error('Error fetching activity events:', err);
        return [];
      }
    },
    refetchInterval: 12000,
    staleTime: 10000,
    retry: 2
  });
}
