import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequestHandler, type RelayLike } from './server.js'
import { parseConfig } from './config.js'

const ORIGIN = 'https://faucet.example.com'

let base = ''
let server: http.Server
let relay: { [K in keyof RelayLike]: ReturnType<typeof vi.fn> }

beforeEach(async () => {
  relay = {
    createSession: vi.fn(),
    getSession: vi.fn(),
    sendRequest: vi.fn(),
    deleteSession: vi.fn(),
  }
  const handle = createRequestHandler(relay as unknown as RelayLike, ORIGIN)
  server = http.createServer((req, res) => void handle(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(() => server.close())

function err(message: string, code?: number) {
  return Object.assign(new Error(message), code === undefined ? {} : { code })
}

describe('GET /api/session', () => {
  it('pins the QR origin to the faucet URL, ignoring the caller Origin header', async () => {
    relay.createSession.mockResolvedValue({ sessionId: 's1', status: 'pending' })
    const res = await fetch(`${base}/api/session`, { headers: { origin: 'https://evil.example' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(relay.createSession).toHaveBeenCalledWith({ origin: ORIGIN })
  })

  it('maps rate limiting to 429', async () => {
    relay.createSession.mockRejectedValue(err('Too many sessions', 429))
    expect((await fetch(`${base}/api/session`)).status).toBe(429)
  })
})

describe('GET /api/session/:id', () => {
  it('returns session info', async () => {
    relay.getSession.mockReturnValue({ sessionId: 's1', status: 'connected', relay: 'wss://r' })
    const res = await fetch(`${base}/api/session/s1`)
    expect(await res.json()).toEqual({ sessionId: 's1', status: 'connected', relay: 'wss://r' })
  })

  it('404s an unknown session', async () => {
    relay.getSession.mockReturnValue(null)
    expect((await fetch(`${base}/api/session/nope`)).status).toBe(404)
  })
})

describe('POST /api/request/:id', () => {
  const post = (body: unknown, token?: string) =>
    fetch(`${base}/api/request/s1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-desktop-token': token } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  it('forwards method, params and desktop token', async () => {
    relay.sendRequest.mockResolvedValue({ id: 'r', seq: 1, result: { publicKey: '02ab' } })
    const res = await post({ method: 'getPublicKey', params: { identityKey: true } }, 'tok')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ result: { publicKey: '02ab' } })
    expect(relay.sendRequest).toHaveBeenCalledWith('s1', 'getPublicKey', { identityKey: true }, 'tok')
  })

  it('400s without a method or with bad JSON', async () => {
    expect((await post({ params: {} }, 'tok')).status).toBe(400)
    expect((await post('{nope', 'tok')).status).toBe(400)
  })

  it('413s an oversized body', async () => {
    expect((await post({ method: 'x', params: { pad: 'a'.repeat(300 * 1024) } }, 'tok')).status).toBe(413)
  })

  it.each([
    [err('Invalid desktop token'), 401],
    [err('Session is pending'), 400],
    [err('bad args', 400), 400],
    [err('busy', 429), 429],
    [err('Request timed out'), 504],
    [err('Relay plaintext exceeds 48 KiB'), 413],
  ])('maps %s to %i', async (e, status) => {
    relay.sendRequest.mockRejectedValue(e)
    expect((await post({ method: 'getPublicKey' }, 'tok')).status).toBe(status)
  })
})

describe('DELETE /api/session/:id', () => {
  it('requires a desktop token', async () => {
    expect((await fetch(`${base}/api/session/s1`, { method: 'DELETE' })).status).toBe(401)
  })

  it('204s on success', async () => {
    const res = await fetch(`${base}/api/session/s1`, { method: 'DELETE', headers: { 'x-desktop-token': 'tok' } })
    expect(res.status).toBe(204)
    expect(relay.deleteSession).toHaveBeenCalledWith('s1', 'tok')
  })

  it('404s an unknown session', async () => {
    relay.deleteSession.mockImplementation(() => {
      throw err('Session not found')
    })
    const res = await fetch(`${base}/api/session/s1`, { method: 'DELETE', headers: { 'x-desktop-token': 'tok' } })
    expect(res.status).toBe(404)
  })
})

describe('parseConfig', () => {
  const ok = {
    RELAY_PRIVATE_KEY: 'a'.repeat(64),
    FAUCET_PUBLIC_URL: 'https://faucet.example.com/',
    RELAY_WS_URL: 'wss://relay.example.com',
  }

  it('applies defaults and strips trailing slashes', () => {
    expect(parseConfig(ok)).toEqual({
      ...ok,
      FAUCET_PUBLIC_URL: 'https://faucet.example.com',
      QR_SCHEMA: 'bsv-wallet',
      PORT: 8787,
    })
  })

  it('rejects a ws URL with a path', () => {
    expect(() => parseConfig({ ...ok, RELAY_WS_URL: 'wss://relay.example.com/ws' })).toThrow()
  })

  it('rejects plain ws:// off loopback', () => {
    expect(() => parseConfig({ ...ok, RELAY_WS_URL: 'ws://relay.example.com' })).toThrow()
    expect(parseConfig({ ...ok, RELAY_WS_URL: 'ws://localhost:8787' }).RELAY_WS_URL).toBe('ws://localhost:8787')
  })

  it('requires a 32-byte hex key', () => {
    expect(() => parseConfig({ ...ok, RELAY_PRIVATE_KEY: 'abc' })).toThrow()
  })
})
