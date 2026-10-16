import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/wallet', () => ({ getFaucetBalanceSats: vi.fn() }))
vi.mock('@/lib/config', async (orig) => (await import('@/lib/test-config')).mockConfigModule(await orig()))

import { GET } from './route'
import { getFaucetBalanceSats } from '@/lib/wallet'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/balance', () => {
  it('returns the spendable balance', async () => {
    ;(getFaucetBalanceSats as any).mockResolvedValue(4999995000)
    const res = await GET(new Request('http://x/api/balance'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ balanceSats: 4999995000, network: 'testnet' })
  })

  it('503 with null balance when the wallet is unavailable', async () => {
    ;(getFaucetBalanceSats as any).mockRejectedValue(new Error('no wallet'))
    const res = await GET(new Request('http://x/api/balance'))
    expect(res.status).toBe(503)
    expect((await res.json()).balanceSats).toBeNull()
  })
})
