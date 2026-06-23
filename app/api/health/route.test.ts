import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ ARCADE_URL: 'http://arcade.test', ARCADE_CHAINTRACKS_URL: 'http://arcade.test/chaintracks/v2' }),
  CHAIN: 'test',
}))

import { GET } from './route'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/health', () => {
  it('reports reachable services', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ height: 1 }) }) as unknown as Response))
    const res = await GET()
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.arcadeReachable).toBe(true)
    expect(json.network).toBe('teratestnet')
  })

  it('reports degraded when chaintracks is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response))
    const res = await GET()
    const json = await res.json()
    expect(json.ok).toBe(false)
  })
})
