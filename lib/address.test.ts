import { describe, it, expect } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { assertTestnetP2PKH, isValidTestnetAddress } from './address'

const testnetAddr = PrivateKey.fromRandom().toPublicKey().toAddress('testnet')
const mainnetAddr = PrivateKey.fromRandom().toPublicKey().toAddress('mainnet')

describe('address validation', () => {
  it('accepts a valid testnet P2PKH address', () => {
    expect(isValidTestnetAddress(testnetAddr)).toBe(true)
    expect(() => assertTestnetP2PKH(testnetAddr)).not.toThrow()
  })

  it('rejects a mainnet address', () => {
    expect(isValidTestnetAddress(mainnetAddr)).toBe(false)
    expect(() => assertTestnetP2PKH(mainnetAddr)).toThrow()
  })

  it('rejects garbage', () => {
    expect(isValidTestnetAddress('not-an-address')).toBe(false)
  })
})
