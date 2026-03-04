import { createPublicClient, decodeEventLog, http, parseAbi, parseAbiItem } from "viem";

type CliOptions = {
  rpcUrl: string;
  oracleAddress: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint | "latest";
  limit: number;
  chunkSize: bigint;
};

const umaEventAbi = parseAbi([
  "event AssertionSettled(bytes32 indexed assertionId, address indexed assertionCaller, bool settlementResolution, bool assertedTruthfully, address settleCaller)",
]);

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const kv = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (key?.startsWith("--") && val) kv.set(key, val);
  }

  const rpcUrl = kv.get("--rpc") || process.env.POLYGON_TESTNET_RPC_URL || "https://rpc-amoy.polygon.technology";
  const oracleAddress =
    (kv.get("--oracle") as `0x${string}`) || ("0xd8866E76441df243fc98B892362Fc6264dC3ca80" as const);
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
    "event AssertionSettled(bytes32 indexed assertionId, address indexed assertionCaller, bool settlementResolution, bool assertedTruthfully, address settleCaller)"
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
    console.log("No AssertionSettled logs found for the given range.");
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
    const assertionId = String(decoded.args.assertionId);
    const assertionCaller = String(decoded.args.assertionCaller);
    const settlementResolution = Boolean(decoded.args.settlementResolution);
    const assertedTruthfully = Boolean(decoded.args.assertedTruthfully);
    const settleCaller = String(decoded.args.settleCaller);
    return {
      blockNumber: Number(log.blockNumber),
      txHash: log.transactionHash,
      logIndex: Number(log.logIndex), // block-wide log index
      txEventIndex: Number(log.logIndex ?? 0), // index within transaction receipt logs
      assertionId,
      assertionCaller,
      settlementResolution,
      assertedTruthfully,
      settleCaller,
      suggestedTrigger: `--evm-tx-hash ${log.transactionHash} --evm-event-index ${Number(log.logIndex ?? 0)}`,
    };
  });

  console.log(JSON.stringify(rows, null, 2));
  console.log("\nTips:");
  console.log(
    `- Scanned ${chunksQueried} chunk(s), blocks ${resolvedFromBlock.toString()}..${resolvedToBlock.toString()} in ${Date.now() - startedAt}ms`
  );
  console.log("- Use one row's txHash/logIndex with CRE simulate trigger-index 1.");
  console.log("- Copy assertionId into config.assertionToTokenMap (lowercase key) once you know tokenId.");
}

main().catch((err) => {
  console.error("find-uma-events failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
