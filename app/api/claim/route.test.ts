import { describe, it, expect, vi, beforeEach } from 'vitest'

// hashIp must be a real (stubbed) fn — the success path calls it.
vi.mock('@/lib/guard', () => ({ guard: vi.fn(), hashIp: (ip: string) => `hash:${ip}` }))
vi.mock('@/lib/faucet', () => ({ claimToAddress: vi.fn() }))
vi.mock('@/lib/wallet', () => ({ payToAddress: vi.fn() }))

import { POST } from './route'
import { guard } from '@/lib/guard'
import { claimToAddress } from '@/lib/faucet'

const ADDR = 'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8' // 34 chars, passes zod min(26); claimToAddress is mocked

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://x/api/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/claim', () => {
  it('400 on invalid body', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('403 when the guard rejects the captcha', async () => {
    ;(guard as any).mockResolvedValue({ ok: false, code: 'captcha', status: 403, message: 'no' })
    const res = await POST(req({ address: ADDR, captchaToken: 't' }))
    expect(res.status).toBe(403)
  })

  it('200 with txid + ef on success', async () => {
    ;(guard as any).mockResolvedValue({ ok: true, subject: 's' })
    ;(claimToAddress as any).mockResolvedValue({ txid: 'tx1', ef: '00ef', amountSats: 100 })
    const res = await POST(req({ address: ADDR, captchaToken: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ txid: 'tx1', ef: '00ef', network: 'teratestnet' })
  })
})
