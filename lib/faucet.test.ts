import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { prisma } from './prisma'
import { claimToAddress, claimToWallet } from './faucet'
import { PrivateKey } from '@bsv/sdk'

const addr = PrivateKey.fromRandom().toPublicKey().toAddress('testnet')
const identityKey = PrivateKey.fromRandom().toPublicKey().toString()

const fakePayment = {
  txid: 'wtx123',
  atomicBEEF: 'beefbeef',
  derivationPrefix: 'pfx',
  derivationSuffix: 'sfx',
  senderIdentityKey: PrivateKey.fromRandom().toPublicKey().toString(),
  outputIndex: 0,
}

describe('claimToAddress', () => {
  beforeAll(() => { process.env.DATABASE_URL = 'file:./prisma/dev.db' })

  it('rejects an invalid address before paying', async () => {
    const pay = vi.fn()
    await expect(
      claimToAddress({ address: 'bad', amountSats: 100, ipHash: 'h' }, { pay }),
    ).rejects.toThrow(/address/i)
    expect(pay).not.toHaveBeenCalled()
  })

  it('caps the amount, pays, and records a Claim', async () => {
    const pay = vi.fn(async () => ({ txid: 'tx123', ef: '00ef' }))
    const r = await claimToAddress(
      { address: addr, amountSats: 999_999_999, ipHash: 'h', maxSats: 500, defaultSats: 100 },
      { pay },
    )
    expect(r.txid).toBe('tx123')
    expect(pay).toHaveBeenCalledWith(addr, 500) // capped
    const row = await prisma.claim.findFirst({ where: { txid: 'tx123' } })
    expect(row?.status).toBe('broadcast')
    await prisma.claim.deleteMany({ where: { txid: 'tx123' } })
  })

  const TEST_KEYS = ['idem-replay-1', 'fail-status-1']
  afterEach(async () => {
    await prisma.claim.deleteMany({ where: { idempotencyKey: { in: TEST_KEYS } } })
  })

  it('replays a prior result for a repeated idempotency key without paying again', async () => {
    await prisma.claim.create({
      data: { recipient: addr, amountSats: 100, ipHash: 'h', idempotencyKey: 'idem-replay-1', txid: 'priortx', ef: 'aaef', status: 'broadcast' },
    })
    const pay = vi.fn()
    const r = await claimToAddress(
      { address: addr, ipHash: 'h', idempotencyKey: 'idem-replay-1', maxSats: 500, defaultSats: 100 },
      { pay },
    )
    expect(r).toEqual({ txid: 'priortx', ef: 'aaef', amountSats: 100 })
    expect(pay).not.toHaveBeenCalled()
  })

  it('marks the claim failed and rethrows when pay throws', async () => {
    const pay = vi.fn(async () => { throw new Error('broadcast boom') })
    await expect(
      claimToAddress(
        { address: addr, ipHash: 'h', idempotencyKey: 'fail-status-1', maxSats: 500, defaultSats: 100 },
        { pay },
      ),
    ).rejects.toThrow('broadcast boom')
    const row = await prisma.claim.findUnique({ where: { idempotencyKey: 'fail-status-1' } })
    expect(row?.status).toBe('failed')
  })
})

describe('claimToWallet', () => {
  beforeAll(() => { process.env.DATABASE_URL = 'file:./prisma/dev.db' })
  afterEach(async () => {
    await prisma.claim.deleteMany({ where: { recipient: identityKey } })
  })

  it('rejects an invalid identity key before paying', async () => {
    const payWallet = vi.fn()
    await expect(
      claimToWallet({ identityKey: 'not-a-key', ipHash: 'h' }, { payWallet }),
    ).rejects.toThrow(/identity key/i)
    expect(payWallet).not.toHaveBeenCalled()
  })

  it('caps the amount, pays, and records a Claim keyed on the identity key', async () => {
    const payWallet = vi.fn(async () => fakePayment)
    const r = await claimToWallet(
      { identityKey, amountSats: 999_999_999, ipHash: 'h', maxSats: 500, defaultSats: 100 },
      { payWallet },
    )
    expect(payWallet).toHaveBeenCalledWith(identityKey, 500) // capped
    expect(r).toMatchObject({ ...fakePayment, amountSats: 500 })
    const row = await prisma.claim.findFirst({ where: { txid: 'wtx123' } })
    expect(row?.recipient).toBe(identityKey)
    expect(row?.status).toBe('broadcast')
    expect(row?.ef).toBe(fakePayment.atomicBEEF) // BEEF stored in the ef column
  })

  it('marks the claim failed and rethrows when payWallet throws', async () => {
    const payWallet = vi.fn(async () => { throw new Error('broadcast boom') })
    await expect(
      claimToWallet({ identityKey, ipHash: 'h', maxSats: 500, defaultSats: 100 }, { payWallet }),
    ).rejects.toThrow('broadcast boom')
    const row = await prisma.claim.findFirst({ where: { recipient: identityKey } })
    expect(row?.status).toBe('failed')
  })
})
