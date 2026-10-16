import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/arcade', () => ({ getTxStatus: vi.fn() }))
vi.mock('@/lib/config', async (orig) => (await import('@/lib/test-config')).mockConfigModule(await orig()))

import { GET } from './route'
import { getTxStatus } from '@/lib/arcade'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/status/[txid]', () => {
  it('returns the status when found', async () => {
    ;(getTxStatus as any).mockResolvedValue({ txid: 'ab', txStatus: 'MINED', blockHeight: 7 })
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ txid: 'ab' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ txid: 'ab', status: 'MINED', blockHeight: 7 })
  })

  it('404 when arcade has no record', async () => {
    ;(getTxStatus as any).mockResolvedValue(null)
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ txid: 'missing' }) })
    expect(res.status).toBe(404)
  })
})
