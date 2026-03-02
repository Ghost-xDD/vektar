import { useQuery } from '@tanstack/react-query';

const YES_TOKEN_ID = import.meta.env.VITE_TOKEN_ID;
const NO_TOKEN_ID = import.meta.env.VITE_NO_TOKEN_ID;

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

/**
 * Merges Yes token bids + No token asks (inverted) to create unified order book.
 * This matches what Polymarket's UI does and what CRE workflow uses.
 * 
 * Why? For a binary market where Yes + No = $1.00:
 * - A No ask at $0.59 = someone selling No for $0.59 = effective Yes bid at $0.41
 * - Most liquidity near spot price comes from inverted No token orders
 */
export function useOrderBook() {
  return useQuery<OrderBookData>({
    queryKey: ['orderBook', YES_TOKEN_ID, NO_TOKEN_ID],
    queryFn: async () => {
      try {
        // Fetch both token books in parallel
        const [yesResponse, noResponse] = await Promise.all([
          fetch(`https://clob.polymarket.com/book?token_id=${YES_TOKEN_ID}`),
          fetch(`https://clob.polymarket.com/book?token_id=${NO_TOKEN_ID}`)
        ]);
        
        if (!yesResponse.ok || !noResponse.ok) {
          throw new Error(`Polymarket API error: ${yesResponse.status} / ${noResponse.status}`);
        }
        
        const [yesData, noData]: [PolymarketResponse, PolymarketResponse] = await Promise.all([
          yesResponse.json(),
          noResponse.json()
        ]);
        
        // Collect all bids: Yes bids + inverted No asks
        interface MergedBid {
          price: number;
          size: number;
        }
        
        const mergedBids: MergedBid[] = [];
        
        // Add Yes token bids (as-is)
        (yesData.bids || []).forEach((bid) => {
          mergedBids.push({
            price: parseFloat(bid.price),
            size: parseFloat(bid.size)
          });
        });
        
        // Add No token asks (inverted to Yes bids)
        // No ask at $0.59 → Yes bid at $0.41
        (noData.asks || []).forEach((ask) => {
          const noPrice = parseFloat(ask.price);
          const invertedYesPrice = 1.0 - noPrice;
          mergedBids.push({
            price: invertedYesPrice,
            size: parseFloat(ask.size)
          });
        });
        
        // Sort by price descending (best bids first)
        mergedBids.sort((a, b) => b.price - a.price);
        
        // Transform to dashboard format with cumulative totals
        let cumulativeTotal = 0;
        const bids: OrderBookLevel[] = mergedBids.map((bid) => {
          const value = bid.price * bid.size;
          cumulativeTotal += value;
          
          return {
            price: bid.price,
            size: bid.size,
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
