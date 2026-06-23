import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from './prisma'

describe('prisma', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'file:./prisma/dev.db'
  })

  it('can write and read a Claim row', async () => {
    const c = await prisma.claim.create({
      data: { recipient: 'mxxx', amountSats: 1, ipHash: 'h', status: 'pending' },
    })
    const found = await prisma.claim.findUnique({ where: { id: c.id } })
    expect(found?.recipient).toBe('mxxx')
    await prisma.claim.delete({ where: { id: c.id } })
  })
})
