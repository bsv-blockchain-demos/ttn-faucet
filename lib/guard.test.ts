import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./config', () => ({
  getConfig: () => ({ TURNSTILE_SECRET_KEY: 'sec', RATE_LIMIT_MAX: 5, RATE_LIMIT_WINDOW_MS: 1000 }),
  CHAIN: 'test',
}))
vi.mock('./turnstile', () => ({ verifyTurnstile: vi.fn() }))
vi.mock('./rate-limit', () => ({ checkAndRecord: vi.fn() }))
vi.mock('./prisma', () => ({ prisma: { apiKey: { findUnique: vi.fn() } } }))

import { guard, hashIp } from './guard'
import { verifyTurnstile } from './turnstile'
import { checkAndRecord } from './rate-limit'
import { prisma } from './prisma'

describe('hashIp', () => {
  it('is deterministic and not the raw IP', () => {
    const a = hashIp('1.2.3.4')
    const b = hashIp('1.2.3.4')
    expect(a).toBe(b)
    expect(a).not.toContain('1.2.3.4')
    expect(a).toHaveLength(64) // sha256 hex
  })
})

describe('guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(checkAndRecord as any).mockResolvedValue({ allowed: true, remaining: 4, retryAfterMs: 0 })
  })

  it('valid API key under limit → ok with apiKeyId, skips captcha, uses tier-multiplied limit', async () => {
    ;(prisma.apiKey.findUnique as any).mockResolvedValue({ id: 'key1', enabled: true, tier: 2 })
    const r = await guard({ ip: '1.2.3.4', apiKey: 'secret-key' })
    expect(r).toMatchObject({ ok: true, subject: 'key1', apiKeyId: 'key1' })
    expect(verifyTurnstile).not.toHaveBeenCalled()
    expect(checkAndRecord).toHaveBeenCalledWith(expect.objectContaining({ subject: 'key1', limit: 10 })) // 5 * tier 2
  })

  it('missing/disabled API key → 401 unauthorized', async () => {
    ;(prisma.apiKey.findUnique as any).mockResolvedValue(null)
    const r = await guard({ ip: '1.2.3.4', apiKey: 'bad' })
    expect(r).toMatchObject({ ok: false, code: 'unauthorized', status: 401 })
  })

  it('public path with failing captcha → 403', async () => {
    ;(verifyTurnstile as any).mockResolvedValue(false)
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'tok' })
    expect(r).toMatchObject({ ok: false, code: 'captcha', status: 403 })
  })

  it('public path, captcha ok, under limit → ok with ipHash subject and no apiKeyId', async () => {
    ;(verifyTurnstile as any).mockResolvedValue(true)
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'tok' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.subject).toBe(hashIp('1.2.3.4'))
      expect(r.apiKeyId).toBeUndefined()
    }
  })

  it('public path over rate limit → 429 with retryAfterMs', async () => {
    ;(verifyTurnstile as any).mockResolvedValue(true)
    ;(checkAndRecord as any).mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 500 })
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'tok' })
    expect(r).toMatchObject({ ok: false, code: 'rate_limit', status: 429, retryAfterMs: 500 })
  })
})
