import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { relayFetch, safeId } from './relay-proxy'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('RELAY_INTERNAL_URL', 'http://relay:8787/')
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('relayFetch', () => {
  it('503s when the relay is not configured', async () => {
    vi.stubEnv('RELAY_INTERNAL_URL', '')
    const res = await relayFetch(new Request('http://x/api/session'), '/api/session')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'relay_disabled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards only content-type, plus the body', async () => {
    fetchMock.mockResolvedValue(new Response('{"result":1}', { status: 200, headers: { 'content-type': 'application/json' } }))
    const req = new Request('http://x/api/request/abc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desktop-token': 'tok', cookie: 'secret=1', origin: 'https://evil' },
      body: '{"method":"getPublicKey"}',
    })
    const res = await relayFetch(req, '/api/request/abc')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://relay:8787/api/request/abc')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"method":"getPublicKey"}')
    const sent = init.headers as Headers
    expect(sent.get('x-desktop-token')).toBeNull()
    expect(sent.get('content-type')).toBe('application/json')
    expect(sent.get('cookie')).toBeNull()
    expect(sent.get('origin')).toBeNull()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({ result: 1 })
  })

  it('passes upstream status codes through, including 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"Session not found"}', { status: 404 }))
    expect((await relayFetch(new Request('http://x'), '/api/session/zz')).status).toBe(404)

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const del = await relayFetch(new Request('http://x', { method: 'DELETE' }), '/api/session/zz')
    expect(del.status).toBe(204)
  })

  it('502s when the relay is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const res = await relayFetch(new Request('http://x/api/session'), '/api/session')
    expect(res.status).toBe(502)
  })
})

describe('safeId', () => {
  it('accepts opaque base64url-ish ids and rejects path tricks', () => {
    expect(safeId('Ab-_09')).toBe('Ab-_09')
    expect(safeId('../health')).toBeNull()
    expect(safeId('a/b')).toBeNull()
    expect(safeId('')).toBeNull()
  })
})
