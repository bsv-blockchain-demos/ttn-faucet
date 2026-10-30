import { describe, it, expect, vi, beforeEach } from 'vitest'

const { cfg } = vi.hoisted(() => ({
  cfg: {
    TURNSTILE_REQUIRED: false,
    TURNSTILE_SECRET_KEY: 'sec',
    RATE_LIMIT_MAX: 5,
    RATE_LIMIT_WINDOW_MS: 1000,
    RATE_LIMIT_DISABLED: false,
  },
}))
vi.mock('./config', () => ({
  getConfig: () => cfg,
  CHAIN: 'test',
}))
vi.mock('./turnstile', () => ({ verifyTurnstile: vi.fn() }))
vi.mock('./rate-limit', () => ({ checkAndRecord: vi.fn() }))
vi.mock('./prisma', () => ({ prisma: { apiKey: { findUnique: vi.fn() } } }))

import { checkCaptcha, guard, hashIp } from './guard'
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
    cfg.RATE_LIMIT_DISABLED = false
    cfg.TURNSTILE_REQUIRED = false
    ;vi.mocked(checkAndRecord).mockResolvedValue({ allowed: true, remaining: 4, retryAfterMs: 0 })
  })

  it('valid API key under limit → ok with apiKeyId, skips captcha, uses tier-multiplied limit', async () => {
    ;vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({ id: 'key1', enabled: true, tier: 2 } as never)
    const r = await guard({ ip: '1.2.3.4', apiKey: 'secret-key' })
    expect(r).toMatchObject({ ok: true, subject: 'key1', apiKeyId: 'key1' })
    expect(verifyTurnstile).not.toHaveBeenCalled()
    expect(checkAndRecord).toHaveBeenCalledWith(expect.objectContaining({ subject: 'key1', limit: 10 })) // 5 * tier 2
  })

  it('missing/disabled API key → 401 unauthorized', async () => {
    ;vi.mocked(prisma.apiKey.findUnique).mockResolvedValue(null)
    const r = await guard({ ip: '1.2.3.4', apiKey: 'bad' })
    expect(r).toMatchObject({ ok: false, code: 'unauthorized', status: 401 })
  })

  it('Turnstile not required → public path ignores the token and never calls siteverify', async () => {
    const r = await guard({ ip: '1.2.3.4' })
    expect(r.ok).toBe(true)
    expect(verifyTurnstile).not.toHaveBeenCalled()
  })

  it('Turnstile required, valid token → ok, verified with the secret and client IP', async () => {
    cfg.TURNSTILE_REQUIRED = true
    vi.mocked(verifyTurnstile).mockResolvedValue(true)
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'tok' })
    expect(r.ok).toBe(true)
    expect(verifyTurnstile).toHaveBeenCalledWith('sec', 'tok', '1.2.3.4')
  })

  it('Turnstile required, missing token → 403 without calling siteverify', async () => {
    cfg.TURNSTILE_REQUIRED = true
    const r = await guard({ ip: '1.2.3.4' })
    expect(r).toMatchObject({ ok: false, code: 'captcha', status: 403 })
    expect(verifyTurnstile).not.toHaveBeenCalled()
    expect(checkAndRecord).not.toHaveBeenCalled()
  })

  it('Turnstile required, invalid token → 403', async () => {
    cfg.TURNSTILE_REQUIRED = true
    vi.mocked(verifyTurnstile).mockResolvedValue(false)
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'bad' })
    expect(r).toMatchObject({ ok: false, code: 'captcha', status: 403 })
    expect(checkAndRecord).not.toHaveBeenCalled()
  })

  it('Turnstile required, captchaVerified (mobile claim at connect) → no token needed', async () => {
    cfg.TURNSTILE_REQUIRED = true
    const r = await guard({ ip: '1.2.3.4', captchaVerified: true })
    expect(r.ok).toBe(true)
    expect(verifyTurnstile).not.toHaveBeenCalled()
  })

  it('Turnstile required, API key → no token needed', async () => {
    cfg.TURNSTILE_REQUIRED = true
    vi.mocked(prisma.apiKey.findUnique).mockResolvedValue({ id: 'key1', enabled: true, tier: 1 } as never)
    const r = await guard({ ip: '1.2.3.4', apiKey: 'secret-key' })
    expect(r.ok).toBe(true)
    expect(verifyTurnstile).not.toHaveBeenCalled()
  })

  it('public path, under limit → ok with ipHash subject and no apiKeyId', async () => {
    ;vi.mocked(verifyTurnstile).mockResolvedValue(true)
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'tok' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.subject).toBe(hashIp('1.2.3.4'))
      expect(r.apiKeyId).toBeUndefined()
    }
  })

  it('public path over rate limit → 429 with retryAfterMs', async () => {
    ;vi.mocked(verifyTurnstile).mockResolvedValue(true)
    ;vi.mocked(checkAndRecord).mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 500 })
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'tok' })
    expect(r).toMatchObject({ ok: false, code: 'rate_limit', status: 429, retryAfterMs: 500 })
  })

  it('RATE_LIMIT_DISABLED → never records or rejects on the limit', async () => {
    cfg.RATE_LIMIT_DISABLED = true
    ;vi.mocked(verifyTurnstile).mockResolvedValue(true)
    ;vi.mocked(checkAndRecord).mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 500 })
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'tok' })
    expect(r.ok).toBe(true) // not 429, even though checkAndRecord would have blocked
    expect(checkAndRecord).not.toHaveBeenCalled()
  })

  it('RATE_LIMIT_DISABLED still rejects a failing captcha (only the limit is off)', async () => {
    cfg.RATE_LIMIT_DISABLED = true
    cfg.TURNSTILE_REQUIRED = true
    vi.mocked(verifyTurnstile).mockResolvedValue(false)
    const r = await guard({ ip: '1.2.3.4', captchaToken: 'bad' })
    expect(r).toMatchObject({ ok: false, code: 'captcha', status: 403 })
  })
})

describe('checkCaptcha', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes everything when Turnstile is not required', async () => {
    cfg.TURNSTILE_REQUIRED = false
    expect(await checkCaptcha(undefined, '1.2.3.4')).toBeNull()
  })

  it('returns the 403 for a refused token when required', async () => {
    cfg.TURNSTILE_REQUIRED = true
    vi.mocked(verifyTurnstile).mockResolvedValue(false)
    expect(await checkCaptcha('bad', '1.2.3.4')).toMatchObject({ ok: false, code: 'captcha', status: 403 })
  })
})
