import { useEffect } from 'react';
import { parseAbiItem } from 'viem';
import { baseClient } from '../lib/clients';
import { useQueryClient } from '@tanstack/react-query';

const VAULT_ADDRESS = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;

export function useEventWatcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let unwatch: (() => void) | undefined;
    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleInvalidate = () => {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['settlementValue'] });
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['position'] });
        invalidateTimer = undefined;
      }, 1000);
    };

    try {
      unwatch = baseClient.watchEvent({
        address: VAULT_ADDRESS,
        events: [
          parseAbiItem(
            'event SettlementValueUpdated(uint256 indexed tokenId, uint256 oldValue, uint256 newValue)'
          ),
          parseAbiItem(
            'event EarlyExitExecuted(address indexed user, uint256 indexed tokenId, uint256 payout)'
          ),
          parseAbiItem(
            'event FinalSettlement(address indexed user, uint256 indexed tokenId, uint8 outcome, uint256 poolPayout)'
          )
        ],
        onLogs: (logs) => {
          if (logs.length > 0) scheduleInvalidate();
        }
      });
    } catch (err) {
      console.warn('Event watcher failed to start:', err);
    }

    return () => {
      unwatch?.();
      if (invalidateTimer) clearTimeout(invalidateTimer);
    };
  }, [queryClient]);
}
