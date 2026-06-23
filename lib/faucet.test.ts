import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma } from './prisma'
import { claimToAddress } from './faucet'
import { PrivateKey } from '@bsv/sdk'

const addr = PrivateKey.fromRandom().toPublicKey().toAddress('testnet')

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
})
