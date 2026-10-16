import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/config', async (orig) => (await import('@/lib/test-config')).mockConfigModule(await orig()))

import { GET } from './route'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/health', () => {
  it('reports reachable services for every configured network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ height: 1 }) }) as unknown as Response))
    const res = await GET()
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.networks.map((n: { network: string }) => n.network)).toEqual(['testnet', 'ttn'])
    expect(json.networks[0]).toMatchObject({ arcadeReachable: true, chaintracksReachable: true })
  })

  it('reports degraded when one network is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        ({ ok: !url.includes('ttn'), status: url.includes('ttn') ? 502 : 200 }) as unknown as Response,
      ),
    )
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(503)
    expect(json.ok).toBe(false)
    expect(json.networks.find((n: { network: string }) => n.network === 'ttn').chaintracksReachable).toBe(false)
  })
})
