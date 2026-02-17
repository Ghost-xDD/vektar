import { useQuery } from '@tanstack/react-query';

const TOKEN_ID = import.meta.env.VITE_TOKEN_ID;

interface PolymarketBid {
  price: string;
  size: string;
}

interface PolymarketResponse {
  bids?: PolymarketBid[];
  asks?: PolymarketAsk[];
}

interface PolymarketAsk {
  price: string;
  size: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  totalBidDepth: number;
  timestamp: number;
}

export function useOrderBook() {
  return useQuery<OrderBookData>({
    queryKey: ['orderBook', TOKEN_ID],
    queryFn: async () => {
      try {
        const response = await fetch(
          `https://clob.polymarket.com/book?token_id=${TOKEN_ID}`
        );
        
        if (!response.ok) {
          throw new Error(`Polymarket API error: ${response.status}`);
        }
        
        const data: PolymarketResponse = await response.json();
        
        // Transform bids to dashboard format with cumulative totals
        let cumulativeTotal = 0;
        const bids: OrderBookLevel[] = (data.bids || []).map((bid) => {
          const price = parseFloat(bid.price);
          const size = parseFloat(bid.size);
          const value = price * size;
          cumulativeTotal += value;
          
          return {
            price,
            size,
            total: cumulativeTotal
          };
        });
        
        const totalBidDepth = cumulativeTotal;
        
        return {
          bids,
          totalBidDepth,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Error fetching order book:', error);
        throw error;
      }
    },
    refetchInterval: 12000, // Poll every 12 seconds (matches CRE cycle)
    staleTime: 10000,
    retry: (failureCount, error) => {
      // Don't retry on 404 - token doesn't exist
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      return failureCount < 2;
    },
    // Gracefully handle errors - fall back to mock data
    onError: (error) => {
      console.warn('Order book fetch failed, dashboard will use fallback data:', error);
    }
  });
}
