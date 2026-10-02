import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createPairingSession,
  endPairingSession,
  getPairingStatus,
  loadSession,
  relayRequest,
  RelayRequestError,
} from './relay-client'
import { RelayWallet } from './relay-wallet'

const fetchMock = vi.fn()
const store = new Map<string, string>()
const session = { sessionId: 's1', desktopToken: 'tok' }

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

describe('createPairingSession', () => {
  it('returns the QR session and persists only the id + token', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ sessionId: 's1', status: 'pending', qrDataUrl: 'data:x', pairingUri: 'bsv-wallet://pair?x', desktopToken: 'tok' }),
    )
    const s = await createPairingSession()
    expect(s.qrDataUrl).toBe('data:x')
    expect(loadSession()).toEqual(session)
  })

  it('throws with the HTTP status when the relay is disabled', async () => {
    fetchMock.mockResolvedValue(jsonRes({ error: 'off' }, 503))
    await expect(createPairingSession()).rejects.toMatchObject({ code: 503 })
    expect(loadSession()).toBeNull()
  })
})

describe('getPairingStatus', () => {
  it('reads status, and treats an unknown session as expired', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ sessionId: 's1', status: 'connected', relay: 'wss://r' }))
    expect(await getPairingStatus('s1')).toBe('connected')
    fetchMock.mockResolvedValueOnce(jsonRes({ error: 'Session not found' }, 404))
    expect(await getPairingStatus('s1')).toBe('expired')
  })
})

describe('relayRequest', () => {
  it('posts method + params with the desktop token and unwraps result', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'r', seq: 2, result: { publicKey: '02ab' } }))
    const out = await relayRequest(session, 'getPublicKey', { identityKey: true })
    expect(out).toEqual({ publicKey: '02ab' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/request/s1')
    expect(init.headers['x-desktop-token']).toBe('tok')
    expect(JSON.parse(init.body)).toEqual({ method: 'getPublicKey', params: { identityKey: true } })
  })

  it('surfaces a user decline from the phone', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'r', seq: 2, error: { code: 4001, message: 'denied' } }))
    const err = (await relayRequest(session, 'internalizeAction', {}).catch((e) => e)) as RelayRequestError
    expect(err).toBeInstanceOf(RelayRequestError)
    expect(err.code).toBe(4001)
    expect(err.message).toMatch(/declined/)
  })

  it('throws relay HTTP errors (e.g. phone timed out)', async () => {
    fetchMock.mockResolvedValue(jsonRes({ error: 'Request timed out' }, 504))
    await expect(relayRequest(session, 'getPublicKey', {})).rejects.toThrow('Request timed out')
  })
})

describe('endPairingSession', () => {
  it('deletes upstream with the token and clears storage', async () => {
    store.set('faucet.mobileWalletSession', JSON.stringify(session))
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await endPairingSession(session)
    expect(loadSession()).toBeNull()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE', headers: { 'x-desktop-token': 'tok' } })
  })
})

describe('loadSession', () => {
  it('survives broken or throwing storage', () => {
    store.set('faucet.mobileWalletSession', '{nope')
    expect(loadSession()).toBeNull()
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadSession()).toBeNull()
  })
})

describe('RelayWallet', () => {
  it('sends key/payment calls to the phone', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 'r', seq: 2, result: { accepted: true } }))
    const w = new RelayWallet(session)
    const args = {
      tx: [1, 1, 1, 1],
      description: 'Teratestnet faucet payout',
      outputs: [],
    }
    expect(await w.internalizeAction(args)).toEqual({ accepted: true })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ method: 'internalizeAction', params: args })
  })
})
