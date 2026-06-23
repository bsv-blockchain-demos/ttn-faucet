import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyTurnstile } from './turnstile'

afterEach(() => vi.unstubAllGlobals())

describe('verifyTurnstile', () => {
  it('returns true when Cloudflare reports success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, 'error-codes': [] }) }) as unknown as Response))
    expect(await verifyTurnstile('secret', 'token', '1.2.3.4')).toBe(true)
  })

  it('returns false on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) }) as unknown as Response))
    expect(await verifyTurnstile('secret', 'bad')).toBe(false)
  })
})
