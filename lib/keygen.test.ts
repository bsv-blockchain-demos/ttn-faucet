import { describe, it, expect } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { generateTestnetKey } from './keygen'
import { isValidTestnetAddress } from './address'

describe('generateTestnetKey', () => {
  it('produces a valid teratestnet address', () => {
    const { address } = generateTestnetKey()
    expect(isValidTestnetAddress(address)).toBe(true)
  })

  it('produces a testnet WIF that round-trips to the same address', () => {
    const { wif, address } = generateTestnetKey()
    const recovered = PrivateKey.fromWif(wif).toPublicKey().toAddress('testnet')
    expect(recovered).toBe(address)
  })

  it('returns a different key each call', () => {
    expect(generateTestnetKey().wif).not.toBe(generateTestnetKey().wif)
  })
})
