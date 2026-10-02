import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  clearPendingClaim,
  loadPendingClaim,
  MobileClaimError,
  pollMobileClaim,
  startMobileClaim,
} from './mobile-claim-client'

const fetchMock = vi.fn()
const store = new Map<string, string>()
const claim = { sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair?topic=s1' }
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  store.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('startMobileClaim', () => {
  it('POSTs, returns the QR and remembers the pending claim', async () => {
    fetchMock.mockResolvedValue(jsonRes(claim))
    expect(await startMobileClaim()).toEqual(claim)
    expect(fetchMock.mock.calls[0]).toEqual(['/api/claim/mobile', expect.objectContaining({ method: 'POST' })])
    expect(loadPendingClaim()).toEqual(claim)
    clearPendingClaim()
    expect(loadPendingClaim()).toBeNull()
  })

  it('throws with the status when mobile pairing is disabled', async () => {
    fetchMock.mockResolvedValue(jsonRes({ error: 'off' }, 503))
    const err = (await startMobileClaim().catch((e) => e)) as MobileClaimError
    expect(err).toBeInstanceOf(MobileClaimError)
    expect(err.status).toBe(503)
    expect(loadPendingClaim()).toBeNull()
  })
})

describe('pollMobileClaim', () => {
  it('returns the view, or null for an unknown claim', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ state: 'done', txid: 't', amount: 5 }))
    expect(await pollMobileClaim('s1')).toEqual({ state: 'done', txid: 't', amount: 5 })
    fetchMock.mockResolvedValueOnce(jsonRes({ error: 'Unknown claim' }, 404))
    expect(await pollMobileClaim('s1')).toBeNull()
  })
})

describe('loadPendingClaim', () => {
  it('survives broken or throwing storage', () => {
    store.set('faucet.mobileClaim', '{nope')
    expect(loadPendingClaim()).toBeNull()
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadPendingClaim()).toBeNull()
  })
})
