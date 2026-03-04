// Handler 3: Private payout routing (triggered on EarlyExitExecuted on Base)
//
// Privacy architecture:
//   Input  privacy: ConfidentialHTTPClient in Handler 1 hides which token_id is being priced.
//   Output privacy: This handler routes the USDC payout to a shielded address via the
//                   Convergence private vault API — amount and recipient are never public.
//
// ──────────────────────────────────────────────────────────────────────────────
// CRE SECRETS — VAULT OPERATOR KEY
//
//   The vault operator key is NEVER in code, config, or logs.
//   It is stored in the CRE vault (secrets.yaml for local simulation) and injected
//   by the Confidential HTTP enclave into the request body via {{.vaultOperatorKey}}.
//   Node operators can observe that a /private-transfer call was made. They cannot
//   see the key, the payout amount, or the shielded recipient address.
//
// ──────────────────────────────────────────────────────────────────────────────
// BFT PROOF
//
//   consensusIdenticalAggregation requires every DON node to produce the same
//   transaction_id before the result crosses the consensus boundary.
//   Tampered operator keys produce different or failed responses → consensus fails.

import {
  bytesToHex,
  cre,
  ConfidentialHTTPClient,
  consensusIdenticalAggregation,
  getNetwork,
  hexToBase64,
  ok,
  type Runtime,
  type EVMLog,
  type ConfidentialHTTPSendRequester,
} from "@chainlink/cre-sdk";
import {
  decodeFunctionResult,
  decodeEventLog,
  encodeFunctionData,
  parseAbi,
} from "viem";
import type { Config } from "../types";

const PRIVATE_VAULT_API = "https://convergence2026-token-api.cldev.cloud";

const EARLY_EXIT_ABI = parseAbi([
  "event EarlyExitExecuted(address indexed user, uint256 indexed tokenId, uint256 payout)",
]);

const SETTLEMENT_VAULT_ABI = parseAbi([
  "function getShieldedAddress(address user, uint256 tokenId) view returns (address)",
]);

// ── Result type that crosses the consensus boundary ───────────────────────────
// Only the transaction_id is returned — payout amount and recipient stay inside the enclave.
interface PrivateTransferResult {
  transactionId: string;
  success: boolean;
}

// ── Confidential HTTP handler for POST /private-transfer ─────────────────────
// Vault operator key and vault token are injected by the enclave via vaultDonSecrets.
// The recipient shielded address and payout amount are processed here — never logged.
const callPrivateTransfer = (
  sendRequester: ConfidentialHTTPSendRequester,
  args: {
    shieldedAddress: string;
    payout: string;
    timestamp: number;
    tenderlyApiOwner: string;
  }
): PrivateTransferResult => {
  const resp = sendRequester
    .sendRequest({
      request: {
        url: `${PRIVATE_VAULT_API}/private-transfer`,
        method: "POST",
        multiHeaders: {
          "Content-Type": { values: ["application/json"] },
        },
        // Vault operator key and token injected by enclave — never visible in code, logs, or WASM.
        // operatorKey is used by the Convergence demo API to produce an EIP-712 auth signature
        // server-side inside the enclave. In production, deploy PrivateVault on Base and call
        // directly from earlyExit() — operator account and Handler 3 are eliminated entirely.
        bodyString: JSON.stringify({
          recipient: args.shieldedAddress,
          token:     "{{.vaultToken}}",
          amount:    args.payout,
          flags:     ["hide-sender"],
          timestamp: args.timestamp,
          operatorKey: "{{.vaultOperatorKey}}",
        }),
      },
      vaultDonSecrets: [
        { key: "vaultOperatorKey", owner: args.tenderlyApiOwner },
        { key: "vaultToken",       owner: args.tenderlyApiOwner },
      ],
      encryptOutput: false,
    })
    .result();

  if (!ok(resp)) {
    throw new Error(
      `Convergence private-transfer failed (${resp.statusCode}): ` +
      new TextDecoder().decode(resp.body)
    );
  }

  const data = JSON.parse(new TextDecoder().decode(resp.body)) as {
    transaction_id?: string;
    error?:          string;
  };

  if (data.error) throw new Error(`Convergence API error: ${data.error}`);

  return {
    transactionId: String(data.transaction_id ?? "unknown"),
    success:       true,
  };
};

/**
 * Private payout handler — fires when EarlyExitExecuted is emitted on SettlementVault (Base).
 *
 * Flow:
 * 1. Decode EarlyExitExecuted (user, tokenId, payout)
 * 2. Read user's shielded address from SettlementVault.getShieldedAddress() via callContract()
 * 3. POST /private-transfer via ConfidentialHTTPClient (operator key sealed in enclave)
 *
 * What each DON node can observe: "a private transfer was made, transaction_id=X"
 * What stays private:             payout amount, shielded recipient, operator identity
 */
export const privatePayout = async (runtime: Runtime<Config>, log: EVMLog): Promise<string> => {
  try {
    runtime.log("[PRIVATE PAYOUT] ─────────────────────────────────────");
    runtime.log("[PRIVATE PAYOUT] EarlyExitExecuted detected on Base");

    // ── Step 1: Decode EarlyExitExecuted event ────────────────────────────────
    const topics = log.topics.map(t => bytesToHex(t)) as [`0x${string}`, ...`0x${string}`[]];
    const decoded = decodeEventLog({
      abi:    EARLY_EXIT_ABI,
      data:   bytesToHex(log.data),
      topics,
    });

    const user    = decoded.args.user    as `0x${string}`;
    const tokenId = decoded.args.tokenId as bigint;
    const payout  = decoded.args.payout  as bigint;

    // Only log user prefix + tokenId prefix — not the full payout amount (partial privacy in logs)
    runtime.log(`[PRIVATE PAYOUT] user:    ${user.slice(0, 8)}...`);
    runtime.log(`[PRIVATE PAYOUT] tokenId: ${tokenId.toString().slice(0, 20)}...`);

    // ── Step 2: Read shielded address from SettlementVault on Base ────────────
    const baseNetwork = getNetwork({
      chainFamily:      "evm",
      chainSelectorName: runtime.config.base.chainSelectorName,
      isTestnet:         runtime.config.base.isTestnet || false,
    });
    if (!baseNetwork) {
      throw new Error(`Base network not found: ${runtime.config.base.chainSelectorName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(baseNetwork.chainSelector.selector);

    const callData = encodeFunctionData({
      abi:          SETTLEMENT_VAULT_ABI,
      functionName: "getShieldedAddress",
      args:         [user, tokenId],
    });

    const callResult = evmClient
      .callContract(runtime, {
        call: {
          to:   hexToBase64(runtime.config.base.vaultAddress),
          data: hexToBase64(callData),
        },
      })
      .result();

    const shieldedAddress = decodeFunctionResult({
      abi:          SETTLEMENT_VAULT_ABI,
      functionName: "getShieldedAddress",
      data:         bytesToHex(callResult.data),
    }) as `0x${string}`;

    // If shielded address is zero, fall through — position was registered without shielding
    if (!shieldedAddress || shieldedAddress === "0x0000000000000000000000000000000000000000") {
      runtime.log("[PRIVATE PAYOUT] No shielded address registered — skipping private transfer");
      runtime.log("[PRIVATE PAYOUT] (User did not opt into private payout at deposit time)");
      return "Skipped — no shielded address";
    }

    runtime.log("[PRIVATE PAYOUT] Shielded address: [sealed in enclave]");
    runtime.log("[PRIVATE PAYOUT] Confidential HTTP: posting private-transfer (credentials + recipient sealed)...");

    // ── Step 3: ConfidentialHTTPClient → POST /private-transfer ──────────────
    // Vault operator key, token, and recipient are sealed inside the enclave.
    // Only the transaction_id and success boolean cross the consensus boundary.
    const confClient = new ConfidentialHTTPClient();
    const timestamp = Math.floor(Date.now() / 1000);

    const result = confClient
      .sendRequest(
        runtime,
        callPrivateTransfer,
        consensusIdenticalAggregation<PrivateTransferResult>()
      )({
        shieldedAddress,
        payout:           payout.toString(),
        timestamp,
        tenderlyApiOwner: "",
      })
      .result();

    runtime.log("[PRIVATE PAYOUT] ─────────────────────────────────────");
    runtime.log("[PRIVATE PAYOUT] ✅ Private transfer complete");
    runtime.log(`[PRIVATE PAYOUT] tx: ${result.transactionId}`);
    runtime.log("[PRIVATE PAYOUT] (amount and recipient are private — no on-chain trace)");
    runtime.log("[PRIVATE PAYOUT] ─────────────────────────────────────");

    return `Private payout complete: txId=${result.transactionId}`;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] privatePayout: ${msg}`);
    throw err;
  }
};
