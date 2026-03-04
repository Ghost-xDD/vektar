import {
  cre,
  ok,
  consensusIdenticalAggregation,
  type Runtime,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import type { Config, OrderBookResponse, OrderBookBid, PolymarketCLOBResponse } from "../types";

const buildBookRequest =
  (apiUrl: string, tokenId: string) =>
  (sendRequester: HTTPSendRequester): OrderBookResponse => {
    const req = {
      url: `${apiUrl.replace(/\/$/, "")}/book?token_id=${encodeURIComponent(tokenId)}`,
      method: "GET" as const,
      headers: {
        Accept: "application/json",
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);
    if (!ok(resp)) {
      return {
        tokenId,
        bids: [],
        asks: [],
        timestamp: Date.now(),
      };
    }

    const parsed = JSON.parse(bodyText) as PolymarketCLOBResponse;
    const bids = (parsed.bids || [])
      .map((b) => ({ price: Number(b.price), size: Number(b.size) }))
      .filter((b) => Number.isFinite(b.price) && Number.isFinite(b.size) && b.price > 0 && b.size > 0)
      .sort((a, b) => b.price - a.price);
    const asks = (parsed.asks || [])
      .map((a) => ({ price: Number(a.price), size: Number(a.size) }))
      .filter((a) => Number.isFinite(a.price) && Number.isFinite(a.size) && a.price > 0 && a.size > 0)
      .sort((a, b) => a.price - b.price);

    return {
      tokenId,
      bids,
      asks,
      timestamp: parsed.timestamp || Date.now(),
    };
  };

/**
 * Fetch a single token's raw order book from the CLOB API.
 */
export const fetchOrderBook = (runtime: Runtime<Config>, tokenId: string): OrderBookResponse => {
  const httpClient = new cre.capabilities.HTTPClient();
  const result = httpClient
    .sendRequest(runtime, buildBookRequest(runtime.config.polymarket.apiUrl, tokenId), consensusIdenticalAggregation<OrderBookResponse>())
    ()
    .result();
  if (result.bids.length === 0) {
    runtime.log(`[POLYMARKET] No orderbook data for token=${tokenId}; using empty book`);
  }
  return result;
};

/**
 * Transform real order book to simulate liquidity scenarios.
 * Instead of replacing with fake data, we modify the real market structure.
 */
const transformOrderBook = (
  runtime: Runtime<Config>,
  scenario: string,
  realOrderBook: OrderBookResponse
): OrderBookResponse => {
  if (scenario === "thin") {
    runtime.log(`[DEMO] 📉 Applying THIN liquidity transformation`);
    // Simulate liquidity drain: reduce all bid sizes by 90%
    // This creates high slippage when trying to sell large positions
    return {
      ...realOrderBook,
      bids: realOrderBook.bids.map(bid => ({
        price: bid.price,
        size: bid.size * 0.10  // Keep only 10% of original liquidity
      }))
    };
  }
  
  if (scenario === "crisis") {
    runtime.log(`[DEMO] 🔥 Applying CRISIS liquidity transformation`);
    // Simulate market panic: 
    // 1. Reduce liquidity by 97% (extreme drain)
    // 2. Apply 20% price decay (panic selling pushes prices down)
    return {
      ...realOrderBook,
      bids: realOrderBook.bids.map(bid => ({
        price: bid.price * 0.80,  // 20% price decay
        size: bid.size * 0.03     // Keep only 3% of liquidity
      }))
    };
  }
  
  // Normal: return unchanged
  return realOrderBook;
};

/**
 * Merge Yes and No token order books into an effective bid-side view.
 *
 * Polymarket uses a Yes+No token pair where Yes price + No price = $1.00.
 * The CLOB API returns separate books per token.  The website merges them:
 *   - No token asks at price P  →  effective Yes bids at (1 - P)
 *
 * Near the spot price, almost all meaningful Yes-side liquidity comes from
 * the No token's ask side.  Without merging, the LTV engine only sees the
 * thin native Yes bids (often <1 cent) and incorrectly reports zero depth.
 */
export const fetchMergedOrderBook = (
  runtime: Runtime<Config>,
  yesTokenId: string,
  noTokenId: string | undefined,
): OrderBookResponse => {
  // Step 1: Always fetch real data from Polymarket
  const yesBook = fetchOrderBook(runtime, yesTokenId);

  let mergedBook: OrderBookResponse;

  if (!noTokenId) {
    runtime.log("[POLYMARKET] No noTokenId configured — using Yes-only book");
    mergedBook = yesBook;
  } else {
    runtime.log("[POLYMARKET] Fetching No token book for merged depth...");
    const noBook = fetchOrderBook(runtime, noTokenId);

    // Convert No asks → effective Yes bids  (No ask at P → Yes bid at 1-P)
    const syntheticBids: OrderBookBid[] = noBook.asks
      .map((a) => ({
        price: Math.round((1 - a.price) * 100) / 100,
        size: a.size,
      }))
      .filter((b) => b.price > 0 && b.size > 0);

    // Merge native Yes bids + synthetic bids, sort by price descending
    const allBids = [...yesBook.bids, ...syntheticBids].sort(
      (a, b) => b.price - a.price,
    );

    // Convert No bids → effective Yes asks  (No bid at P → Yes ask at 1-P)
    const syntheticAsks = noBook.bids
      .map((b) => ({
        price: Math.round((1 - b.price) * 100) / 100,
        size: b.size,
      }))
      .filter((a) => a.price > 0 && a.size > 0);

    const allAsks = [...yesBook.asks, ...syntheticAsks].sort(
      (a, b) => a.price - b.price,
    );

    runtime.log(
      `[CONSENSUS] ✓ Merged order book: ${allBids.length} bid levels, ${allAsks.length} ask levels`,
    );

    mergedBook = {
      tokenId: yesTokenId,
      bids: allBids,
      asks: allAsks,
      timestamp: Math.max(yesBook.timestamp, noBook.timestamp),
    };
  }

  // Step 2: Apply demo transformation if needed
  const demoScenario = runtime.config.demo?.scenario;
  if (demoScenario && demoScenario !== "normal") {
    return transformOrderBook(runtime, demoScenario, mergedBook);
  }

  return mergedBook;
};
