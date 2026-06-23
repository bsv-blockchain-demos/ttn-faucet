import { Utils } from '@bsv/sdk'

/** Returns the 20-byte pubkey hash for a valid teratestnet (0x6f) P2PKH address, else throws. */
export function assertTestnetP2PKH(addr: string): number[] {
  let decoded: { data: number[] | string; prefix: number[] | string }
  try {
    decoded = Utils.fromBase58Check(addr)
  } catch {
    throw new Error('Malformed address')
  }
  const prefix = decoded.prefix as number[]
  const data = decoded.data as number[]
  if (!Array.isArray(prefix) || prefix.length !== 1 || prefix[0] !== 0x6f) {
    throw new Error('Not a teratestnet (0x6f) address')
  }
  if (!Array.isArray(data) || data.length !== 20) {
    throw new Error('Not a 20-byte P2PKH hash')
  }
  return data
}

export function isValidTestnetAddress(addr: string): boolean {
  try {
    assertTestnetP2PKH(addr)
    return true
  } catch {
    return false
  }
}
