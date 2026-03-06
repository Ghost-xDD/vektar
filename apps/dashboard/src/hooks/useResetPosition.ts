import { useState } from 'react';
import { keccak256, encodeAbiParameters, toHex, padHex } from 'viem';
import { useQueryClient } from '@tanstack/react-query';

const ADMIN_RPC       = import.meta.env.VITE_BASE_TENDERLY_ADMIN_RPC as string;
const ACCESS_KEY      = import.meta.env.VITE_TENDERLY_ACCESS_KEY as string | undefined;
const VAULT_ADDRESS   = import.meta.env.VITE_SETTLEMENT_VAULT_ADDRESS as `0x${string}`;
const TOKEN_ID        = BigInt(import.meta.env.VITE_TOKEN_ID);

// Storage layout of SettlementVault:
//   slot 0: marketOracles mapping
//   slot 1: positions mapping  ← we need this one
//   slot 2: marketParticipants mapping
//   slot 3: isParticipant mapping
//   slot 4: activeMarketIds array
const POSITIONS_SLOT = 1n;

// Position struct slot offsets (from base):
//   +0: tokenId
//   +1: shares
//   +2: paidOutUSDC
//   +3: settled (bool, 1 byte) + polygonAddress (address, 20 bytes)  ← packed
//   +4: shieldedAddress
const SHARES_OFFSET      = 1n;
const PAID_OUT_OFFSET    = 2n;
const SETTLED_POLY_OFFSET = 3n;
const SHIELDED_OFFSET    = 4n;

// Zero out so that the next registerPosition() call (which does +=) lands at exactly 20,000.
const SHARES_RESET = 0n;

function positionBaseSlot(userAddress: `0x${string}`): bigint {
  // keccak256(abi.encode(user, POSITIONS_SLOT))
  const innerSlot = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [userAddress, POSITIONS_SLOT]
    )
  );
  // keccak256(abi.encode(tokenId, innerSlot))
  const baseSlot = keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint256' }],
      [TOKEN_ID, BigInt(innerSlot)]
    )
  );
  return BigInt(baseSlot);
}

function slotHex(slot: bigint): `0x${string}` {
  return padHex(toHex(slot), { size: 32 });
}

async function setStorage(slot: `0x${string}`, value: `0x${string}`) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ACCESS_KEY) headers['X-Access-Key'] = ACCESS_KEY;

  const res = await fetch(ADMIN_RPC, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'tenderly_setStorageAt',
      params: [VAULT_ADDRESS, slot, value]
    })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'setStorageAt failed');
}

export type ResetState = 'idle' | 'pending' | 'done' | 'error';

export function useResetPosition() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ResetState>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = async (
    userAddress: `0x${string}`,
    polygonAddress: `0x${string}`,
    shieldedAddress: `0x${string}`
  ) => {
    setError(null);
    setState('pending');
    try {
      const base = positionBaseSlot(userAddress);

      // slot+1: shares = 20000
      await setStorage(
        slotHex(base + SHARES_OFFSET),
        padHex(toHex(SHARES_RESET), { size: 32 })
      );

      // slot+2: paidOutUSDC = 0
      await setStorage(
        slotHex(base + PAID_OUT_OFFSET),
        padHex('0x0', { size: 32 })
      );

      // slot+3: settled(bool,1b) + polygonAddress(20b)
      // EVM packs settled in the lowest byte, polygonAddress in next 20 bytes
      // Layout (big-endian 32-byte slot): [11 bytes zero][polygonAddress 20 bytes][settled 1 byte]
      // settled = false → 0x00, so slot3 = polygonAddress << 8
      const slot3Value = padHex(
        toHex((BigInt(polygonAddress) << 8n) | 0n),
        { size: 32 }
      );
      await setStorage(slotHex(base + SETTLED_POLY_OFFSET), slot3Value);

      // slot+4: shieldedAddress (keep as-is — just re-write it cleanly)
      await setStorage(
        slotHex(base + SHIELDED_OFFSET),
        padHex(shieldedAddress, { size: 32 })
      );

      setState('done');
      queryClient.invalidateQueries({ queryKey: ['position'] });
      setTimeout(() => setState('idle'), 3000);
    } catch (err: any) {
      setError(err.message ?? 'Reset failed');
      setState('error');
    }
  };

  return { reset, state, error };
}
