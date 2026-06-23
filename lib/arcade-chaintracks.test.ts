import { describe, it, expect, vi, afterEach } from 'vitest'
import { ArcadeChaintracks } from './arcade-chaintracks'

const URL = 'http://arcade.test/chaintracks/v2'
const header = {
  version: 1, previousHash: 'aa', merkleRoot: 'ROOT', time: 1, bits: 1, nonce: 1, height: 42, hash: 'hh',
}

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [suffix, value] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return { ok: true, status: 200, json: async () => value } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('ArcadeChaintracks', () => {
  it('getPresentHeight reads /height', async () => {
    mockFetch({ '/height': { height: 42 } })
    const ct = new ArcadeChaintracks('test', URL)
    expect(await ct.getPresentHeight()).toBe(42)
  })

  it('findHeaderForHeight reads /header/height/{h}', async () => {
    mockFetch({ '/header/height/42': header })
    const ct = new ArcadeChaintracks('test', URL)
    const h = await ct.findHeaderForHeight(42)
    expect(h?.merkleRoot).toBe('ROOT')
  })

  it('isValidRootForHeight compares the stored merkleRoot', async () => {
    mockFetch({ '/header/height/42': header })
    const ct = new ArcadeChaintracks('test', URL)
    expect(await ct.isValidRootForHeight('ROOT', 42)).toBe(true)
    expect(await ct.isValidRootForHeight('WRONG', 42)).toBe(false)
  })
})
