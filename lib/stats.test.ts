import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from './prisma'
import { getFaucetStats } from './stats'

describe('getFaucetStats', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'file:./prisma/dev.db'
  })

  it('counts and sums only broadcast claims (delta against existing rows)', async () => {
    const before = await getFaucetStats()

    // Two successful payouts and one failed/pending row that must be ignored.
    const a = await prisma.claim.create({ data: { recipient: 'mtest1', amountSats: 1000, ipHash: 'h', status: 'broadcast' } })
    const b = await prisma.claim.create({ data: { recipient: 'mtest2', amountSats: 2500, ipHash: 'h', status: 'broadcast' } })
    const c = await prisma.claim.create({ data: { recipient: 'mtest3', amountSats: 9999, ipHash: 'h', status: 'pending' } })

    try {
      const after = await getFaucetStats()
      expect(after.payoutCount - before.payoutCount).toBe(2)
      expect(after.totalSatsDisbursed - before.totalSatsDisbursed).toBe(3500)
    } finally {
      await prisma.claim.deleteMany({ where: { id: { in: [a.id, b.id, c.id] } } })
    }
  })
})
