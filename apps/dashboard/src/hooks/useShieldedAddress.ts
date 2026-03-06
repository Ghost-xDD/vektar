import { useState } from 'react';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export function useShieldedAddress() {
  const [shieldedKey, setShieldedKey] = useState<`0x${string}` | null>(null);
  const [shieldedAddress, setShieldedAddress] = useState<`0x${string}` | null>(null);

  const generate = () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    setShieldedKey(pk);
    setShieldedAddress(account.address);
  };

  const reset = () => {
    setShieldedKey(null);
    setShieldedAddress(null);
  };

  return { generate, reset, shieldedKey, shieldedAddress };
}
