import { describe, it, expect, vi, beforeEach } from 'vitest'

// hashIp must be a real (stubbed) fn — the success path calls it.
vi.mock('@/lib/guard', () => ({ guard: vi.fn(), hashIp: (ip: string) => `hash:${ip}` }))
vi.mock('@/lib/faucet', () => ({ claimToWallet: vi.fn() }))
vi.mock('@/lib/wallet', () => ({ payToWallet: vi.fn() }))
vi.mock('@/lib/config', async (orig) => (await import('@/lib/test-config')).mockConfigModule(await orig()))

import { POST } from './route'
import { guard } from '@/lib/guard'
import { claimToWallet } from '@/lib/faucet'

// 66-char compressed pubkey (02/03 prefix) — passes the identityKey regex; claimToWallet is mocked.
const IDENTITY_KEY = '02cffd5f8b799a89c018dc51fdbd803782f74a935a23b196294a9629735300b75e'

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://x/api/claim/wallet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/claim/wallet', () => {
  it('400 on invalid body', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('does not 400 on an empty captchaToken (captcha disabled)', async () => {
    vi.mocked(guard).mockResolvedValue({ ok: true, subject: 's' })
    vi.mocked(claimToWallet).mockResolvedValue({
      txid: 'tx1',
      atomicBEEF: '00beef',
      derivationPrefix: 'p',
      derivationSuffix: 's',
      senderIdentityKey: IDENTITY_KEY,
      outputIndex: 0,
      amountSats: 100,
    })
    const res = await POST(req({ identityKey: IDENTITY_KEY, captchaToken: '' }))
    expect(res.status).toBe(200)
  })

  it('200 with txid + atomicBEEF on success', async () => {
    vi.mocked(guard).mockResolvedValue({ ok: true, subject: 's' })
    vi.mocked(claimToWallet).mockResolvedValue({
      txid: 'tx1',
      atomicBEEF: '00beef',
      derivationPrefix: 'p',
      derivationSuffix: 's',
      senderIdentityKey: IDENTITY_KEY,
      outputIndex: 0,
      amountSats: 100,
    })
    const res = await POST(req({ identityKey: IDENTITY_KEY, captchaToken: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ txid: 'tx1', atomicBEEF: '00beef', network: 'testnet' })
  })

  it('keys the guard on CF-Connecting-IP and passes it on for siteverify', async () => {
    vi.mocked(guard).mockResolvedValue({ ok: false, code: 'captcha', status: 403, message: 'no' })
    await POST(req({ identityKey: IDENTITY_KEY }, { 'cf-connecting-ip': '203.0.113.7' }))
    expect(vi.mocked(guard).mock.calls[0][0]).toMatchObject({ ip: '203.0.113.7', remoteIp: '203.0.113.7' })
  })

  it('falls back to X-Forwarded-For for the guard, with no remoteIp', async () => {
    vi.mocked(guard).mockResolvedValue({ ok: false, code: 'captcha', status: 403, message: 'no' })
    await POST(req({ identityKey: IDENTITY_KEY }))
    const ctx = vi.mocked(guard).mock.calls[0][0]
    expect(ctx.ip).toBe('9.9.9.9')
    expect(ctx.remoteIp).toBeUndefined()
  })
})
