import { describe, it, expect } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { assertTestnetP2PKH, isValidTestnetAddress, assertIdentityKey } from './address'

const testnetAddr = PrivateKey.fromRandom().toPublicKey().toAddress('testnet')
const mainnetAddr = PrivateKey.fromRandom().toPublicKey().toAddress('mainnet')
const identityKey = PrivateKey.fromRandom().toPublicKey().toString()

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

describe('assertIdentityKey', () => {
  it('accepts a valid compressed identity key', () => {
    expect(identityKey).toMatch(/^0[23][0-9a-fA-F]{64}$/)
    expect(() => assertIdentityKey(identityKey)).not.toThrow()
  })

  it('rejects a wrong-length / wrong-prefix key', () => {
    expect(() => assertIdentityKey('04' + identityKey.slice(2))).toThrow(/identity key/i) // uncompressed prefix
    expect(() => assertIdentityKey(identityKey.slice(0, -2))).toThrow(/identity key/i) // too short
  })

  it('rejects non-hex and an off-curve key', () => {
    expect(() => assertIdentityKey('zz' + identityKey.slice(2))).toThrow(/identity key/i)
    expect(() => assertIdentityKey('02' + '00'.repeat(32))).toThrow(/identity key/i) // valid shape, not on curve
  })
})
