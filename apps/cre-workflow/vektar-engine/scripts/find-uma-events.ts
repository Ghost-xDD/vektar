import { createPublicClient, decodeEventLog, http, parseAbi, parseAbiItem } from "viem";

type CliOptions = {
  rpcUrl: string;
  oracleAddress: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint | "latest";
  limit: number;
  chunkSize: bigint;
};

// QuestionResolved from Polymarket's UMA CTF Adapter on Polygon mainnet
const umaEventAbi = parseAbi([
  "event QuestionResolved(bytes32 indexed questionId, int256 indexed resolution, uint256[] payouts)",
]);

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const kv = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (key?.startsWith("--") && val) kv.set(key, val);
  }

  const rpcUrl = kv.get("--rpc") || process.env.POLYGON_TENDERLY_RPC || process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
  // Polymarket UMA CTF Adapter on Polygon mainnet
  const oracleAddress =
    (kv.get("--oracle") as `0x${string}`) || ("0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74" as const);
  const fromBlock = BigInt(kv.get("--fromBlock") || "-1");
  const toBlockRaw = kv.get("--toBlock");
  const toBlock = toBlockRaw ? BigInt(toBlockRaw) : "latest";
  const limit = Number(kv.get("--limit") || "20");
  const chunkSize = BigInt(kv.get("--chunkSize") || "50000");

  return { rpcUrl, oracleAddress, fromBlock, toBlock, limit, chunkSize };
};

async function main() {
  const startedAt = Date.now();
  const opts = parseArgs();
  const client = createPublicClient({
    transport: http(opts.rpcUrl),
  });

  const latest = await client.getBlockNumber();
  const resolvedFromBlock =
    opts.fromBlock >= 0n ? opts.fromBlock : latest > 1000n ? latest - 1000n : 0n;
  const resolvedToBlock = opts.toBlock === "latest" ? latest : opts.toBlock;

  const event = parseAbiItem(
    "event QuestionResolved(bytes32 indexed questionId, int256 indexed resolution, uint256[] payouts)"
  );
  const logs: Awaited<ReturnType<typeof client.getLogs>> = [];
  let chunksQueried = 0;
  let cursor = resolvedToBlock;

  while (cursor >= resolvedFromBlock && logs.length < opts.limit) {
    const chunkFrom =
      cursor >= opts.chunkSize - 1n && cursor - (opts.chunkSize - 1n) > resolvedFromBlock
        ? cursor - (opts.chunkSize - 1n)
        : resolvedFromBlock;
    const chunkTo = cursor;
    chunksQueried += 1;

    let chunkLogs: Awaited<ReturnType<typeof client.getLogs>>;
    try {
      chunkLogs = await client.getLogs({
        address: opts.oracleAddress,
        event,
        fromBlock: chunkFrom,
        toBlock: chunkTo,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("up to a 10 block range")) {
        throw new Error(
          "Your RPC plan limits eth_getLogs to 10 blocks. Re-run with --chunkSize 10 (and a smaller --fromBlock lookback)."
        );
      }
      throw err;
    }
    if (chunkLogs.length > 0) logs.push(...chunkLogs);
    if (chunkFrom === resolvedFromBlock) break;
    cursor = chunkFrom - 1n;
  }

  const sliced = logs
    .sort((a, b) => Number((b.blockNumber || 0n) - (a.blockNumber || 0n)))
    .slice(0, opts.limit);
  if (sliced.length === 0) {
    console.log("No QuestionResolved logs found for the given range.");
    console.log(
      `Scanned ${chunksQueried} chunk(s), blocks ${resolvedFromBlock.toString()}..${resolvedToBlock.toString()} in ${Date.now() - startedAt}ms`
    );
    return;
  }

  const rows = sliced.map((log) => {
    const decoded = decodeEventLog({
      abi: umaEventAbi,
      topics: log.topics,
      data: log.data,
    });
    const questionId = String(decoded.args.questionId);
    const resolution = String(decoded.args.resolution);
    const payouts = (decoded.args.payouts as bigint[]).map(String);
    return {
      blockNumber: Number(log.blockNumber),
      txHash: log.transactionHash,
      logIndex: Number(log.logIndex),
      questionId,
      resolution,
      payouts,
      suggestedTrigger: `--evm-tx-hash ${log.transactionHash} --evm-event-index ${Number(log.logIndex ?? 0)}`,
    };
  });

  console.log(JSON.stringify(rows, null, 2));
  console.log("\nTips:");
  console.log(
    `- Scanned ${chunksQueried} chunk(s), blocks ${resolvedFromBlock.toString()}..${resolvedToBlock.toString()} in ${Date.now() - startedAt}ms`
  );
  console.log("- Use one row's suggestedTrigger with: cre workflow simulate vektar-engine --trigger-index 1 --target local-simulation <suggestedTrigger>");
  console.log("- resolution=0 means YES won, resolution=1 means NO won (Polymarket convention).");
}

main().catch((err) => {
  console.error("find-uma-events failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
