import { useQuery } from '@tanstack/react-query';
import { useDemoStore } from '../lib/demo-store';

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
 * Transform real order book to simulate liquidity scenarios.
 * Matches the CRE workflow transformation logic.
 */
function transformOrderBook(scenario: string, realBids: OrderBookLevel[]): OrderBookLevel[] {
  if (scenario === 'thin') {
    // Simulate liquidity drain: reduce all bid sizes by 90%
    return realBids.map(bid => ({
      ...bid,
      size: bid.size * 0.10  // Keep only 10% of original liquidity
    }));
  }
  
  if (scenario === 'crisis') {
    // Simulate market panic: 97% liquidity drain + 20% price decay
    return realBids.map(bid => ({
      ...bid,
      price: bid.price * 0.80,  // 20% price decay
      size: bid.size * 0.03     // Keep only 3% of liquidity
    }));
  }
  
  return realBids;
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
  const scenario = useDemoStore((state) => state.scenario);
  
  return useQuery<OrderBookData>({
    queryKey: ['orderBook', YES_TOKEN_ID, NO_TOKEN_ID, scenario],
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
        
        // Aggregate orders at the same price level (rounded to 2 decimals)
        const aggregatedBids = new Map<number, number>();
        mergedBids.forEach((bid) => {
          const roundedPrice = Math.round(bid.price * 100) / 100;
          const existing = aggregatedBids.get(roundedPrice) || 0;
          aggregatedBids.set(roundedPrice, existing + bid.size);
        });
        
        // Transform to dashboard format with cumulative totals
        let cumulativeTotal = 0;
        let bids: OrderBookLevel[] = Array.from(aggregatedBids.entries())
          .sort((a, b) => b[0] - a[0]) // Sort by price descending
          .map(([price, size]) => {
            const value = price * size;
            cumulativeTotal += value;
            
            return {
              price,
              size,
              total: cumulativeTotal
            };
          });
        
        // Apply demo transformation if needed
        if (scenario !== 'normal') {
          console.log(`[DEMO] Applying ${scenario} transformation to order book`);
          bids = transformOrderBook(scenario, bids);
          
          // Recalculate cumulative totals after transformation
          let newCumulative = 0;
          bids = bids.map(bid => {
            const value = bid.price * bid.size;
            newCumulative += value;
            return { ...bid, total: newCumulative };
          });
          cumulativeTotal = newCumulative;
        }
        
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
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      return failureCount < 2;
    }
  });
}
