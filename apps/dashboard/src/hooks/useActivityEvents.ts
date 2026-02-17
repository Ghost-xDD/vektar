import { useQuery } from '@tanstack/react-query';
import { parseAbiItem } from 'viem';
import { baseClient } from '../lib/clients';

const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS as `0x${string}`;
const TOKEN_ID = BigInt(import.meta.env.VITE_TOKEN_ID);

export interface ActivityEvent {
  id: string;
  timestamp: Date;
  type: 'ltv_update' | 'liquidation' | 'settlement' | 'position_opened';
  description: string;
  txHash: string;
  chain: 'base' | 'polygon';
  oldValue?: number;
  newValue?: number;
  user?: string;
}

export function useActivityEvents() {
  return useQuery<ActivityEvent[]>({
    queryKey: ['events', TOKEN_ID.toString()],
    queryFn: async () => {
      try {
        const currentBlock = await baseClient.getBlockNumber();
        // Alchemy free tier allows exactly 10 blocks per request
        const fromBlock = currentBlock - 9n; // Current block + 9 previous = 10 blocks total
        const toBlock = currentBlock; // Explicitly set to avoid 'latest' issues
        
        // Fetch LTV update events
        const ltvUpdates = await baseClient.getLogs({
          address: VAULT_ADDRESS,
          event: parseAbiItem('event MarketLTVUpdated(uint256 indexed tokenId, uint256 oldLTV, uint256 newLTV)'),
          args: { tokenId: TOKEN_ID },
          fromBlock,
          toBlock
        });
        
        // Fetch liquidation events
        const liquidations = await baseClient.getLogs({
          address: VAULT_ADDRESS,
          event: parseAbiItem('event PositionMarkedLiquidatable(address indexed user, uint256 indexed tokenId)'),
          args: { tokenId: TOKEN_ID },
          fromBlock,
          toBlock
        });
        
        // Fetch position opened events
        const positionsOpened = await baseClient.getLogs({
          address: VAULT_ADDRESS,
          event: parseAbiItem('event PositionOpened(address indexed user, uint256 indexed tokenId, uint256 collateralAmount, uint256 debtAmount)'),
          args: { tokenId: TOKEN_ID },
          fromBlock,
          toBlock
        });
        
        // Get block timestamps for events
        const blockNumbers = new Set([
          ...ltvUpdates.map(log => log.blockNumber),
          ...liquidations.map(log => log.blockNumber),
          ...positionsOpened.map(log => log.blockNumber)
        ]);
        
        const blockTimestamps = new Map<bigint, number>();
        await Promise.all(
          Array.from(blockNumbers).map(async (blockNum) => {
            try {
              const block = await baseClient.getBlock({ blockNumber: blockNum });
              blockTimestamps.set(blockNum, Number(block.timestamp) * 1000);
            } catch (error) {
              console.warn(`Failed to fetch block ${blockNum}:`, error);
              blockTimestamps.set(blockNum, Date.now());
            }
          })
        );
        
        // Transform to activity events
        const events: ActivityEvent[] = [
          ...ltvUpdates.map(log => ({
            id: log.transactionHash + '-' + log.logIndex.toString(),
            timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
            type: 'ltv_update' as const,
            description: `LTV Updated: ${Number(log.args.oldLTV || 0n)}bps → ${Number(log.args.newLTV || 0n)}bps`,
            txHash: log.transactionHash,
            chain: 'base' as const,
            oldValue: Number(log.args.oldLTV || 0n),
            newValue: Number(log.args.newLTV || 0n)
          })),
          ...liquidations.map(log => ({
            id: log.transactionHash + '-' + log.logIndex.toString(),
            timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
            type: 'liquidation' as const,
            description: `Position marked liquidatable`,
            txHash: log.transactionHash,
            chain: 'base' as const,
            user: log.args.user as string
          })),
          ...positionsOpened.map(log => ({
            id: log.transactionHash + '-' + log.logIndex.toString(),
            timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
            type: 'position_opened' as const,
            description: `Position opened: ${Number(log.args.collateralAmount || 0n) / 1e18} shares, $${Number(log.args.debtAmount || 0n) / 1e6} debt`,
            txHash: log.transactionHash,
            chain: 'base' as const,
            user: log.args.user as string
          }))
        ];
        
        // Sort by timestamp descending (newest first)
        return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      } catch (error) {
        console.error('Error fetching activity events:', error);
        // Return empty array on error instead of throwing
        return [];
      }
    },
    refetchInterval: 12000, // Poll every 12 seconds (matches CRE cycle)
    staleTime: 10000,
    retry: 2,
    // Don't throw errors - gracefully degrade
    onError: (error) => {
      console.warn('Activity events fetch failed:', error);
    }
  });
}
