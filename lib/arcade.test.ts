import { describe, it, expect, vi, afterEach } from 'vitest'
import { broadcastRawTx, getTxStatus } from './arcade'

const URL = 'http://arcade.test'

function mockFetch(impl: (url: string, init?: RequestInit) => Partial<Response> & { json: () => Promise<unknown> }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => impl(url, init) as unknown as Response))
}

afterEach(() => vi.unstubAllGlobals())

describe('broadcastRawTx', () => {
  it('returns ok=true on 202 submitted', async () => {
    mockFetch(() => ({ status: 202, ok: true, json: async () => ({ status: 'submitted' }) }))
    const r = await broadcastRawTx(URL, 'deadbeef')
    expect(r.ok).toBe(true)
    expect(r.doubleSpend).toBe(false)
  })

  it('treats "already submitted" as ok', async () => {
    mockFetch(() => ({ status: 200, ok: true, json: async () => ({ status: 'already submitted', txid: 'ab', state: 'SEEN_ON_NETWORK' }) }))
    const r = await broadcastRawTx(URL, 'deadbeef')
    expect(r.ok).toBe(true)
    expect(r.alreadyKnown).toBe(true)
  })

  it('flags a double spend', async () => {
    mockFetch(() => ({ status: 200, ok: true, json: async () => ({ status: 'DOUBLE_SPEND_ATTEMPTED' }) }))
    const r = await broadcastRawTx(URL, 'deadbeef')
    expect(r.ok).toBe(false)
    expect(r.doubleSpend).toBe(true)
  })
})

describe('getTxStatus', () => {
  it('parses a MINED status with merklePath', async () => {
    mockFetch(() => ({ status: 200, ok: true, json: async () => ({ txid: 'ab', txStatus: 'MINED', blockHeight: 42, merklePath: 'cafe' }) }))
    const s = await getTxStatus(URL, 'ab')
    expect(s).not.toBeNull()
    expect(s!.txStatus).toBe('MINED')
    expect(s!.merklePath).toBe('cafe')
    expect(s!.blockHeight).toBe(42)
  })

  it('returns null for a 404', async () => {
    mockFetch(() => ({ status: 404, ok: false, json: async () => ({}) }))
    const s = await getTxStatus(URL, 'missing')
    expect(s).toBeNull()
  })
})
