import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/stats', () => ({ getFaucetStats: vi.fn() }))

import { GET } from './route'
import { getFaucetStats } from '@/lib/stats'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/stats', () => {
  it('returns lifetime payout count and sats disbursed', async () => {
    ;(getFaucetStats as any).mockResolvedValue({ payoutCount: 42, totalSatsDisbursed: 4_200_000 })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ payoutCount: 42, totalSatsDisbursed: 4_200_000 })
  })

  it('503 with null stats when the database is unavailable', async () => {
    ;(getFaucetStats as any).mockRejectedValue(new Error('db down'))
    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).payoutCount).toBeNull()
  })
})
