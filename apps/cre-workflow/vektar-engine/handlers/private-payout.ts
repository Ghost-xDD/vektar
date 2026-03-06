// Handler 3: Private payout routing (triggered on EarlyExitExecuted on Base)
//
// Privacy architecture:
//   Input  privacy: ConfidentialHTTPClient in Handler 1 hides which token_id is being priced.
//   Output privacy: This handler routes the settlement to a shielded address via the
//                   Convergence private vault API — recipient and amount are never correlated
//                   back to the on-chain earlyExit() call.
//
// ── HOW AUTH WORKS ────────────────────────────────────────────────────────────
//   The Convergence API uses EIP-712 typed data signatures for every request.
//   The vault operator key is read from process.env.VAULT_OPERATOR_KEY (local simulation)
//   which maps to the CRE DON secret `vaultOperatorKey` in production.
//   The handler signs the request body before sending — the key itself never appears
//   in any request, log, or on-chain data.
//
// ── TOKEN ────────────────────────────────────────────────────────────────────
//   Convergence vault token: LINK on Ethereum Sepolia
//   0x779877A7B0D9E8603169DdbD7836e478b4624789
//   The vault operator must have a private balance of this token deposited
//   before private transfers will succeed. Run ./setup-private-vault.sh first.
//
// ── BFT PROOF ────────────────────────────────────────────────────────────────
//   consensusIdenticalAggregation requires every DON node to produce the same
//   transaction_id — tampered or missing operator keys produce different or
//   failed responses, causing consensus to fail before any state changes.

import {
  bytesToHex,
  cre,
  consensusIdenticalAggregation,
  getNetwork,
  hexToBase64,
  ok,
  type Runtime,
  type EVMLog,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import {
  decodeFunctionResult,
  decodeEventLog,
  encodeFunctionData,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "../types";

const PRIVATE_VAULT_API = "https://convergence2026-token-api.cldev.cloud";

// LINK on Ethereum Sepolia — the only token registered in the Convergence demo vault
const VAULT_TOKEN = "0x779877A7B0D9E8603169DdbD7836e478b4624789";

// Transfer 1 LINK (symbolic amount for the demo). In production, scale this
// to match the USDC payout value using a LINK/USD price feed.
const TRANSFER_AMOUNT_WEI = "1000000000000000000"; // 1 LINK in 18 decimals

const PRIVATE_VAULT_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: 11155111,
  verifyingContract: "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13" as `0x${string}`,
};

const EARLY_EXIT_ABI = parseAbi([
  "event EarlyExitExecuted(address indexed user, uint256 indexed tokenId, uint256 payout)",
]);

const SETTLEMENT_VAULT_ABI = parseAbi([
  "function getShieldedAddress(address user, uint256 tokenId) view returns (address)",
]);

interface PrivateTransferResult {
  transactionId: string;
  success: boolean;
}

// ── Requester factory ─────────────────────────────────────────────────────────
// Pre-computed values (auth signature, recipient, amount) are baked in via closure.
// The requester itself is synchronous — CRE HTTP capabilities do not support async.
const buildPrivateTransferRequest =
  (payload: {
    account: string;
    recipient: string;
    token: string;
    amount: string;
    flags: string[];
    timestamp: number;
    auth: string;
  }) =>
  (sendRequester: HTTPSendRequester): PrivateTransferResult => {
    const resp = sendRequester
      .sendRequest({
        url: `${PRIVATE_VAULT_API}/private-transfer`,
        method: "POST" as const,
        headers: { "Content-Type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify(payload)),
      })
      .result();

    if (!ok(resp)) {
      const body = new TextDecoder().decode(resp.body);
      throw new Error(
        `Convergence /private-transfer failed (${resp.statusCode}): ${body}`
      );
    }

    const data = JSON.parse(new TextDecoder().decode(resp.body)) as {
      transaction_id?: string;
      error?: string;
      error_details?: string;
    };

    if (data.error) {
      throw new Error(
        `Convergence API error: ${data.error} — ${data.error_details ?? ""}`
      );
    }

    return {
      transactionId: String(data.transaction_id ?? "unknown"),
      success: true,
    };
  };

/**
 * Private payout handler — fires when EarlyExitExecuted is emitted on SettlementVault (Base).
 *
 * Flow:
 * 1. Decode EarlyExitExecuted (user, tokenId, payout)
 * 2. Read user's shielded address from SettlementVault.getShieldedAddress()
 * 3. Sign EIP-712 private-transfer request with vault operator key
 * 4. POST /private-transfer → Convergence vault credits shielded address
 *
 * What each DON node can observe: "a private transfer was made, transaction_id=X"
 * What stays private:             shielded address linkage, operator identity (hide-sender)
 *
 * Prerequisites:
 *   - VAULT_OPERATOR_KEY in .env / CRE secrets (run ./setup-private-vault.sh)
 *   - Operator must have deposited LINK into the Convergence vault first
 */
export const privatePayout = async (runtime: Runtime<Config>, log: EVMLog): Promise<string> => {
  try {
    runtime.log("[PRIVATE PAYOUT] ─────────────────────────────────────────");
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

    runtime.log(`[PRIVATE PAYOUT] user:    ${user.slice(0, 8)}...`);
    runtime.log(`[PRIVATE PAYOUT] tokenId: ${tokenId.toString().slice(0, 20)}...`);
    runtime.log(`[PRIVATE PAYOUT] payout:  $${(Number(payout) / 1_000_000).toFixed(2)} USDC`);

    // ── Step 2: Read shielded address from SettlementVault on Base ────────────
    const baseNetwork = getNetwork({
      chainFamily:       "evm",
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

    if (!shieldedAddress || shieldedAddress === "0x0000000000000000000000000000000000000000") {
      runtime.log("[PRIVATE PAYOUT] No shielded address registered for this user.");
      runtime.log("[PRIVATE PAYOUT] User opted out of private payout at deposit time.");
      runtime.log("[PRIVATE PAYOUT] (To enable: call registerPosition with a shielded address)");
      return "Skipped — no shielded address registered";
    }

    runtime.log("[PRIVATE PAYOUT] Shielded address resolved ✓ (value sealed, not logged)");

    // ── Step 3: Load vault operator key and sign EIP-712 message ─────────────
    // Secrets are fetched via runtime.getSecret() — works in both local simulation
    // (maps from VAULT_OPERATOR_KEY in .env via secrets.yaml) and production CRE
    // (reads from Vault DON). The key itself never appears in code, logs, or on-chain.
    let operatorKeyHex: `0x${string}` | undefined;
    try {
      const secret = runtime.getSecret({ id: "vaultOperatorKey" }).result();
      operatorKeyHex = secret.value as `0x${string}`;
    } catch {
      operatorKeyHex = undefined;
    }

    if (!operatorKeyHex) {
      runtime.log("[PRIVATE PAYOUT] ⚠️  VAULT_OPERATOR_KEY not set in secrets.");
      runtime.log("[PRIVATE PAYOUT]    Run ./setup-private-vault.sh to create an operator wallet.");
      runtime.log("[PRIVATE PAYOUT]    Then add VAULT_OPERATOR_KEY to .env (secrets.yaml already maps it).");
      return "Skipped — VAULT_OPERATOR_KEY not configured";
    }

    const vaultOperator = privateKeyToAccount(operatorKeyHex);
    runtime.log(`[PRIVATE PAYOUT] Operator: ${vaultOperator.address.slice(0, 8)}...`);

    const timestamp = Math.floor(Date.now() / 1000);

    // EIP-712 signature — proves the operator authorized this specific transfer.
    // Signs: sender, recipient, token, amount, flags, timestamp.
    // The operator key never appears in the request body or any log.
    const auth = await vaultOperator.signTypedData({
      domain: PRIVATE_VAULT_DOMAIN,
      types: {
        "Private Token Transfer": [
          { name: "sender",    type: "address" },
          { name: "recipient", type: "address" },
          { name: "token",     type: "address" },
          { name: "amount",    type: "uint256" },
          { name: "flags",     type: "string[]" },
          { name: "timestamp", type: "uint256" },
        ],
      },
      primaryType: "Private Token Transfer",
      message: {
        sender:    vaultOperator.address,
        recipient: shieldedAddress,
        token:     VAULT_TOKEN as `0x${string}`,
        amount:    BigInt(TRANSFER_AMOUNT_WEI),
        flags:     ["hide-sender"],
        timestamp: BigInt(timestamp),
      },
    });

    runtime.log(`[PRIVATE PAYOUT] EIP-712 signature computed ✓`);
    runtime.log(`[PRIVATE PAYOUT] Sending 1 LINK → shielded address (hide-sender flag set)...`);

    // ── Step 4: POST /private-transfer via HTTPClient (BFT consensus) ─────────
    const httpClient = new cre.capabilities.HTTPClient();

    const result = httpClient
      .sendRequest(
        runtime,
        buildPrivateTransferRequest({
          account:   vaultOperator.address,
          recipient: shieldedAddress,
          token:     VAULT_TOKEN,
          amount:    TRANSFER_AMOUNT_WEI,
          flags:     ["hide-sender"],
          timestamp,
          auth,
        }),
        consensusIdenticalAggregation<PrivateTransferResult>()
      )()
      .result();

    runtime.log("[PRIVATE PAYOUT] ─────────────────────────────────────────");
    runtime.log("[PRIVATE PAYOUT] ✅ Private transfer complete");
    runtime.log(`[PRIVATE PAYOUT] transaction_id: ${result.transactionId}`);
    runtime.log("[PRIVATE PAYOUT] Recipient and amount are private — no on-chain link");
    runtime.log("[PRIVATE PAYOUT] ─────────────────────────────────────────");

    return `Private payout complete: txId=${result.transactionId}`;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] privatePayout: ${msg}`);
    throw err;
  }
};
