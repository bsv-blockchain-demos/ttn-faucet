import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const claims = { create: vi.fn(), view: vi.fn(), check: vi.fn() }
vi.mock('@/lib/mobile-claim-runtime', () => ({ mobileClaims: () => claims }))
vi.mock('@/lib/config', async (orig) => (await import('@/lib/test-config')).mockConfigModule(await orig()))
const { checkCaptcha } = vi.hoisted(() => ({ checkCaptcha: vi.fn() }))
vi.mock('@/lib/guard', () => ({ checkCaptcha }))

import { POST as start } from './route'
import { GET as poll, POST as notify } from './[id]/route'
import { RelayError } from '@/lib/relay-api'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  checkCaptcha.mockResolvedValue(null)
  vi.stubEnv('RELAY_INTERNAL_URL', 'http://relay:8787')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/claim/mobile', () => {
  it('503s when mobile pairing is not enabled', async () => {
    vi.stubEnv('RELAY_INTERNAL_URL', '')
    const res = await start(new Request('http://x', { method: 'POST' }))
    expect(res.status).toBe(503)
    expect(claims.create).not.toHaveBeenCalled()
  })

  it('creates a claim for the client IP and returns the QR (no desktop token)', async () => {
    claims.create.mockResolvedValue({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair' })
    const res = await start(new Request('http://x', { method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair' })
    expect(claims.create).toHaveBeenCalledWith('9.9.9.9', 'testnet')
  })

  it('checks the Turnstile token against the CF-Connecting-IP address before opening a session', async () => {
    claims.create.mockResolvedValue({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair' })
    const body = JSON.stringify({ network: 'ttn', captchaToken: 'tok' })
    const headers = { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.5' }
    const res = await start(new Request('http://x', { method: 'POST', body, headers }))
    expect(res.status).toBe(200)
    expect(checkCaptcha).toHaveBeenCalledWith('tok', '203.0.113.7')
    expect(claims.create).toHaveBeenCalledWith('203.0.113.7', 'ttn')
  })

  it('opens the session on the /64 of an IPv6 visitor, checking the token against the full address', async () => {
    claims.create.mockResolvedValue({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair' })
    const body = JSON.stringify({ network: 'ttn', captchaToken: 'tok' })
    const headers = { 'cf-connecting-ip': '2001:db8:1:2:aaaa::1' }
    const res = await start(new Request('http://x', { method: 'POST', body, headers }))
    expect(res.status).toBe(200)
    expect(checkCaptcha).toHaveBeenCalledWith('tok', '2001:db8:1:2:aaaa::1')
    expect(claims.create).toHaveBeenCalledWith('2001:db8:1:2::/64', 'ttn')
  })

  it("ignores Cloudflare's cross-zone Worker address and uses X-Forwarded-For, with no IP for siteverify", async () => {
    claims.create.mockResolvedValue({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair' })
    const body = JSON.stringify({ network: 'ttn', captchaToken: 'tok' })
    const headers = { 'cf-connecting-ip': '2a06:98c0:3600::103', 'x-forwarded-for': '198.51.100.4' }
    const res = await start(new Request('http://x', { method: 'POST', body, headers }))
    expect(res.status).toBe(200)
    expect(checkCaptcha).toHaveBeenCalledWith('tok', undefined)
    expect(claims.create).toHaveBeenCalledWith('198.51.100.4', 'ttn')
  })

  it('sends siteverify no IP when the address only came from X-Forwarded-For', async () => {
    claims.create.mockResolvedValue({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair' })
    const body = JSON.stringify({ network: 'ttn', captchaToken: 'tok' })
    const res = await start(new Request('http://x', { method: 'POST', body, headers: { 'x-forwarded-for': '9.9.9.9' } }))
    expect(res.status).toBe(200)
    expect(checkCaptcha).toHaveBeenCalledWith('tok', undefined)
    expect(claims.create).toHaveBeenCalledWith('9.9.9.9', 'ttn')
  })

  it('403s and opens no session when the Turnstile check fails', async () => {
    checkCaptcha.mockResolvedValue({ ok: false, code: 'captcha', status: 403, message: 'Captcha verification failed' })
    const res = await start(new Request('http://x', { method: 'POST', body: JSON.stringify({ network: 'ttn' }) }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'captcha' })
    expect(claims.create).not.toHaveBeenCalled()
  })

  it('passes a relay rate limit through as 429', async () => {
    claims.create.mockRejectedValue(new RelayError('Too many sessions', 429))
    expect((await start(new Request('http://x', { method: 'POST' }))).status).toBe(429)
  })

  it('creates the claim on the requested network', async () => {
    claims.create.mockResolvedValue({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair' })
    const body = JSON.stringify({ network: 'ttn' })
    expect((await start(new Request('http://x', { method: 'POST', body }))).status).toBe(200)
    expect(claims.create).toHaveBeenCalledWith('unknown', 'ttn')
  })

  it('400 for a network this faucet does not serve', async () => {
    const body = JSON.stringify({ network: 'tstn' })
    expect((await start(new Request('http://x', { method: 'POST', body }))).status).toBe(400)
    expect(claims.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/claim/mobile/:id', () => {
  it('returns the claim view and nudges a waiting claim', async () => {
    claims.view.mockReturnValue({ state: 'waiting' })
    const res = await poll(new Request('http://x'), ctx('s1'))
    expect(await res.json()).toEqual({ state: 'waiting' })
    expect(claims.check).toHaveBeenCalledWith('s1')
  })

  it('does not re-check a finished claim', async () => {
    claims.view.mockReturnValue({ state: 'done', txid: 't', amount: 1 })
    await poll(new Request('http://x'), ctx('s1'))
    expect(claims.check).not.toHaveBeenCalled()
  })

  it('404s an unknown claim and 400s a bad id', async () => {
    claims.view.mockReturnValue(null)
    expect((await poll(new Request('http://x'), ctx('s1'))).status).toBe(404)
    expect((await poll(new Request('http://x'), ctx('../x'))).status).toBe(400)
  })
})

describe('POST /api/claim/mobile/:id (relay connect webhook)', () => {
  it('only prompts a check, and needs no Turnstile token (server to server)', async () => {
    const res = await notify(new Request('http://x', { method: 'POST' }), ctx('s1'))
    expect(res.status).toBe(202)
    expect(claims.check).toHaveBeenCalledWith('s1')
    expect(checkCaptcha).not.toHaveBeenCalled()
  })
})
