import {
  cre,
  ok,
  consensusIdenticalAggregation,
  type Runtime,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import type { Config, OrderBookResponse, PolymarketCLOBResponse } from "../types";

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
