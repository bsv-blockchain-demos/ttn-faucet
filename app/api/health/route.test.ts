import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/config', async (orig) => (await import('@/lib/test-config')).mockConfigModule(await orig()))

import { GET } from './route'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

type NetHealth = { network: string; ok: boolean; arcadeReachable: boolean; chaintracksReachable: boolean }

describe('GET /api/health', () => {
  it('reports reachable services for every configured network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ height: 1 }) }) as unknown as Response))
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, degraded: false })
    expect(json.networks.map((n: NetHealth) => n.network)).toEqual(['testnet', 'ttn'])
    expect(json.networks[0]).toMatchObject({ arcadeReachable: true, chaintracksReachable: true })
  })

  it('stays 200 but degraded while at least one network is healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        ({ ok: !url.includes('ttn'), status: url.includes('ttn') ? 502 : 200 }) as unknown as Response,
      ),
    )
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, degraded: true })
    expect(json.networks.find((n: NetHealth) => n.network === 'ttn').chaintracksReachable).toBe(false)
  })

  it('503 when no network can pay out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ ok: false, degraded: true })
  })
})
