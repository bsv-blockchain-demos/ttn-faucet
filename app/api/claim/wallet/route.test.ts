import { describe, it, expect, vi, beforeEach } from 'vitest'

// hashIp must be a real (stubbed) fn — the success path calls it.
vi.mock('@/lib/guard', () => ({ guard: vi.fn(), hashIp: (ip: string) => `hash:${ip}` }))
vi.mock('@/lib/faucet', () => ({ claimToWallet: vi.fn() }))
vi.mock('@/lib/wallet', () => ({ payToWallet: vi.fn() }))

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
    ;(guard as any).mockResolvedValue({ ok: true, subject: 's' })
    ;(claimToWallet as any).mockResolvedValue({
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
    ;(guard as any).mockResolvedValue({ ok: true, subject: 's' })
    ;(claimToWallet as any).mockResolvedValue({
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
    expect(json).toMatchObject({ txid: 'tx1', atomicBEEF: '00beef', network: 'teratestnet' })
  })
})
