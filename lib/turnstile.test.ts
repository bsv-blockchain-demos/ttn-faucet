import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyTurnstile } from './turnstile'

afterEach(() => vi.unstubAllGlobals())

/** Stub siteverify with one response (or a thrown error). */
function siteverify(result: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('verifyTurnstile', () => {
  it('posts the secret, token and IP to siteverify and accepts success: true', async () => {
    const fetchMock = siteverify(Response.json({ success: true }))
    expect(await verifyTurnstile('sec', 'tok', '1.2.3.4')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: 'sec', response: 'tok', remoteip: '1.2.3.4' })
  })

  it('rejects success: false', async () => {
    siteverify(Response.json({ success: false, 'error-codes': ['invalid-input-response'] }))
    expect(await verifyTurnstile('sec', 'bad')).toBe(false)
  })

  it('rejects a non-2xx answer', async () => {
    siteverify(new Response('oops', { status: 500 }))
    expect(await verifyTurnstile('sec', 'tok')).toBe(false)
  })

  it('rejects, without throwing, when siteverify is unreachable', async () => {
    siteverify(new TypeError('fetch failed'))
    expect(await verifyTurnstile('sec', 'tok')).toBe(false)
  })
})
