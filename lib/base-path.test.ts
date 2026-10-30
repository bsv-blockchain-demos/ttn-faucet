import { describe, it, expect, vi, afterEach } from 'vitest'
import { DEFAULT_SITE_URL, siteUrl } from './base-path'

afterEach(() => vi.unstubAllEnvs())

describe('siteUrl', () => {
  it('defaults to the public address, base path included', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(siteUrl()).toBe(DEFAULT_SITE_URL)
    expect(siteUrl('/api/claim')).toBe('https://bsvblockchain.com/faucet/api/claim')
  })

  it('takes NEXT_PUBLIC_SITE_URL, with or without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/faucet/')
    expect(siteUrl('/api/claim')).toBe('https://example.com/faucet/api/claim')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/faucet')
    expect(siteUrl('/api/claim')).toBe('https://example.com/faucet/api/claim')
  })

  it('works with a bare origin', () => {
    expect(siteUrl('/api/claim', 'https://example.com/')).toBe('https://example.com/api/claim')
  })
})
