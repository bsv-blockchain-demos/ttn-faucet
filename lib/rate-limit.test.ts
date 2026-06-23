import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from './prisma'
import { checkAndRecord } from './rate-limit'

describe('checkAndRecord', () => {
  beforeAll(() => { process.env.DATABASE_URL = 'file:./prisma/dev.db' })
  beforeEach(async () => { await prisma.rateEvent.deleteMany({ where: { subject: 'subj-test' } }) })

  it('allows up to the limit then blocks', async () => {
    const opts = { subject: 'subj-test', limit: 3, windowMs: 60_000 }
    expect((await checkAndRecord(opts)).allowed).toBe(true)
    expect((await checkAndRecord(opts)).allowed).toBe(true)
    expect((await checkAndRecord(opts)).allowed).toBe(true)
    const blocked = await checkAndRecord(opts)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })
})
