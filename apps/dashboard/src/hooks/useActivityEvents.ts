import { useQuery } from '@tanstack/react-query';
import { parseAbiItem } from 'viem';
import { baseClient, polygonClient } from '../lib/clients';

const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS as `0x${string}`;
const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS as `0x${string}`;
const TOKEN_ID = BigInt(import.meta.env.VITE_TOKEN_ID);

export interface ActivityEvent {
  id: string;
  timestamp: Date;
  type: 'ltv_update' | 'liquidation' | 'settlement' | 'position_opened' | 'collateral_deposited' | 'collateral_released';
  description: string;
  txHash: string;
  chain: 'base' | 'polygon';
  oldValue?: number;
  newValue?: number;
  user?: string;
  hasChange?: boolean; 
}

/**
 * Fetches logs in chunks to work with Alchemy's free tier (10-block limit per request).
 * Fetches up to 500 blocks total (50 requests × 10 blocks = ~15 minutes of history).
 */
async function fetchLogsInChunks(
  client: typeof baseClient | typeof polygonClient,
  contractAddress: `0x${string}`,
  eventAbi: string,
  args: any,
  blocksToFetch: bigint = 500n
) {
  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - blocksToFetch > 0n ? currentBlock - blocksToFetch : 0n;
  const CHUNK_SIZE = 10n; // Alchemy free tier limit
  
  const allLogs = [];
  
  // Fetch in 10-block chunks
  for (let from = startBlock; from <= currentBlock; from += CHUNK_SIZE) {
    const to = from + CHUNK_SIZE - 1n > currentBlock ? currentBlock : from + CHUNK_SIZE - 1n;
    
    try {
      const logs = await client.getLogs({
        address: contractAddress,
        event: parseAbiItem(eventAbi) as any,
        args,
        fromBlock: from,
        toBlock: to
      });
      allLogs.push(...logs);
    } catch (error) {
      console.warn(`Failed to fetch logs for blocks ${from}-${to}:`, error);
      // Continue with other chunks even if one fails
    }
  }
  
  return allLogs;
}

export function useActivityEvents() {
  return useQuery<ActivityEvent[]>({
    queryKey: ['events', TOKEN_ID.toString()],
    queryFn: async () => {
      try {
        // Fetch Base events
        const [ltvUpdates, liquidations, positionsOpened] = await Promise.all([
          fetchLogsInChunks(
            baseClient,
            VAULT_ADDRESS,
            'event MarketLTVUpdated(uint256 indexed tokenId, uint256 oldLTV, uint256 newLTV, uint256 timestamp)',
            { tokenId: TOKEN_ID }
          ),
          fetchLogsInChunks(
            baseClient,
            VAULT_ADDRESS,
            'event PositionMarkedLiquidatable(address indexed user, uint256 indexed tokenId)',
            { tokenId: TOKEN_ID }
          ),
          fetchLogsInChunks(
            baseClient,
            VAULT_ADDRESS,
            'event PositionOpened(address indexed user, uint256 indexed tokenId, uint256 collateralAmount, uint256 debtAmount)',
            { tokenId: TOKEN_ID }
          )
        ]);
        
        // Fetch Polygon events (collateral locking/releasing)
        const [collateralDeposited, collateralReleased] = await Promise.all([
          fetchLogsInChunks(
            polygonClient,
            ESCROW_ADDRESS,
            'event CollateralDeposited(address indexed user, uint256 indexed tokenId, uint256 amount)',
            { tokenId: TOKEN_ID }
          ),
          fetchLogsInChunks(
            polygonClient,
            ESCROW_ADDRESS,
            'event CollateralReleased(address indexed user, uint256 indexed tokenId, uint256 amount)',
            { tokenId: TOKEN_ID }
          )
        ]);
        
        console.log('[ActivityFeed] Found events:', {
          base: { ltvUpdates: ltvUpdates.length, liquidations: liquidations.length, positionsOpened: positionsOpened.length },
          polygon: { collateralDeposited: collateralDeposited.length, collateralReleased: collateralReleased.length }
        });
        
        // Log sample events for debugging
        if (collateralDeposited.length > 0) {
          console.log('[ActivityFeed] Sample Polygon CollateralDeposited:', collateralDeposited[0]);
        }
        if (ltvUpdates.length > 0) {
          console.log('[ActivityFeed] Sample Base LTV update:', ltvUpdates[0]);
        }
        
        // Get block timestamps for Base events
        const baseBlockNumbers = new Set([
          ...ltvUpdates.map(log => log.blockNumber),
          ...liquidations.map(log => log.blockNumber),
          ...positionsOpened.map(log => log.blockNumber)
        ]);
        
        const blockTimestamps = new Map<bigint, number>();
        await Promise.all(
          Array.from(baseBlockNumbers).map(async (blockNum) => {
            try {
              const block = await baseClient.getBlock({ blockNumber: blockNum });
              blockTimestamps.set(blockNum, Number(block.timestamp) * 1000);
            } catch (error) {
              console.warn(`Failed to fetch Base block ${blockNum}:`, error);
              blockTimestamps.set(blockNum, Date.now());
            }
          })
        );
        
        // Get block timestamps for Polygon events
        const polygonBlockNumbers = new Set([
          ...collateralDeposited.map(log => log.blockNumber),
          ...collateralReleased.map(log => log.blockNumber)
        ]);
        
        await Promise.all(
          Array.from(polygonBlockNumbers).map(async (blockNum) => {
            try {
              const block = await polygonClient.getBlock({ blockNumber: blockNum });
              blockTimestamps.set(blockNum, Number(block.timestamp) * 1000);
            } catch (error) {
              console.warn(`Failed to fetch Polygon block ${blockNum}:`, error);
              blockTimestamps.set(blockNum, Date.now());
            }
          })
        );
        
        // Transform to activity events
        const events: ActivityEvent[] = [
          // Base LTV events - show last 10 regardless of change
          ...(ltvUpdates as any[])
            .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber)) // Newest first
            .slice(0, 10) // Keep last 10
            .map(log => {
              const oldLTV = Number(log.args?.oldLTV || 0n);
              const newLTV = Number(log.args?.newLTV || 0n);
              const hasChange = oldLTV !== newLTV;
              
              return {
                id: log.transactionHash + '-ltv-' + log.logIndex.toString(),
                timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
                type: 'ltv_update' as const,
                description: hasChange 
                  ? `LTV Updated: ${oldLTV}bps → ${newLTV}bps`
                  : `LTV Monitored: ${newLTV}bps (stable)`,
                txHash: log.transactionHash,
                chain: 'base' as const,
                oldValue: oldLTV,
                newValue: newLTV,
                hasChange
              };
            }),
          ...(liquidations as any[]).map(log => ({
            id: log.transactionHash + '-liq-' + log.logIndex.toString(),
            timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
            type: 'liquidation' as const,
            description: `Position marked liquidatable`,
            txHash: log.transactionHash,
            chain: 'base' as const,
            user: log.args?.user as string
          })),
          ...(positionsOpened as any[]).map(log => ({
            id: log.transactionHash + '-pos-' + log.logIndex.toString(),
            timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
            type: 'position_opened' as const,
            description: `Position opened: ${Number(log.args?.collateralAmount || 0n) / 1e18} shares, $${Number(log.args?.debtAmount || 0n) / 1e6} debt`,
            txHash: log.transactionHash,
            chain: 'base' as const,
            user: log.args?.user as string
          })),
          // Polygon events
          ...(collateralDeposited as any[]).map(log => ({
            id: log.transactionHash + '-dep-' + log.logIndex.toString(),
            timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
            type: 'collateral_deposited' as const,
            description: `Collateral locked: ${Number(log.args?.amount || 0n) / 1e18} shares on Polygon`,
            txHash: log.transactionHash,
            chain: 'polygon' as const,
            user: log.args?.user as string
          })),
          ...(collateralReleased as any[]).map(log => ({
            id: log.transactionHash + '-rel-' + log.logIndex.toString(),
            timestamp: new Date(blockTimestamps.get(log.blockNumber) || Date.now()),
            type: 'collateral_released' as const,
            description: `Collateral released: ${Number(log.args?.amount || 0n) / 1e18} shares from Polygon`,
            txHash: log.transactionHash,
            chain: 'polygon' as const,
            user: log.args?.user as string
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
    retry: 2
  });
}
