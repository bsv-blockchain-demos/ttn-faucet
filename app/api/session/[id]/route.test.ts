import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/relay-proxy', async (orig) => ({
  ...(await orig<typeof import('@/lib/relay-proxy')>()),
  relayFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}))

import { GET } from './route'
import { relayFetch } from '@/lib/relay-proxy'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.clearAllMocks())

describe('GET /api/session/:id (phone relay lookup)', () => {
  it('proxies to the relay', async () => {
    const req = new Request('http://x')
    await GET(req, ctx('abc'))
    expect(relayFetch).toHaveBeenCalledWith(req, '/api/session/abc')
  })

  it('400s ids that could rewrite the upstream path', async () => {
    const res = await GET(new Request('http://x'), ctx('..%2Fhealth'))
    expect(res.status).toBe(400)
    expect(relayFetch).not.toHaveBeenCalled()
  })
})
