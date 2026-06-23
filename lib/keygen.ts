import { PrivateKey } from '@bsv/sdk'

/**
 * Generate a throwaway teratestnet keypair. Pure + isomorphic (browser & node):
 * used client-side so the key never leaves the user's browser.
 */
export function generateTestnetKey(): { wif: string; address: string } {
  const key = PrivateKey.fromRandom()
  return {
    wif: key.toWif([0xef]), // testnet WIF prefix (0xef) — matches the testnet address
    address: key.toPublicKey().toAddress('testnet'),
  }
}
