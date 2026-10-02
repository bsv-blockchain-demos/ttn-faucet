import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/relay-proxy', async (orig) => ({
  ...(await orig<typeof import('@/lib/relay-proxy')>()),
  relayFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}))

import { GET as createSession } from './route'
import { GET as getSession, DELETE as deleteSession } from './[id]/route'
import { POST as request } from '../request/[id]/route'
import { relayFetch } from '@/lib/relay-proxy'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.clearAllMocks())

describe('relay proxy routes', () => {
  it('GET /api/session -> /api/session', async () => {
    const req = new Request('http://x/api/session')
    await createSession(req)
    expect(relayFetch).toHaveBeenCalledWith(req, '/api/session')
  })

  it('GET/DELETE /api/session/:id -> /api/session/:id', async () => {
    await getSession(new Request('http://x'), ctx('abc'))
    await deleteSession(new Request('http://x', { method: 'DELETE' }), ctx('abc'))
    expect(vi.mocked(relayFetch).mock.calls.map((c) => c[1])).toEqual(['/api/session/abc', '/api/session/abc'])
  })

  it('POST /api/request/:id -> /api/request/:id', async () => {
    await request(new Request('http://x', { method: 'POST', body: '{}' }), ctx('abc'))
    expect(relayFetch).toHaveBeenCalledWith(expect.any(Request), '/api/request/abc')
  })

  it('400s ids that could rewrite the upstream path', async () => {
    const res = await getSession(new Request('http://x'), ctx('..%2Fhealth'))
    expect(res.status).toBe(400)
    expect(relayFetch).not.toHaveBeenCalled()
  })
})
