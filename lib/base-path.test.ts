import { describe, it, expect } from 'vitest'
import { DEFAULT_SITE_URL, siteUrl } from './base-path'

describe('siteUrl', () => {
  it('defaults to the public address, base path included', () => {
    expect(siteUrl()).toBe(DEFAULT_SITE_URL)
    expect(siteUrl('/api/claim')).toBe('https://bsvblockchain.com/faucet/api/claim')
  })

  it('takes a base with or without a trailing slash', () => {
    expect(siteUrl('/api/claim', 'https://example.com/faucet/')).toBe('https://example.com/faucet/api/claim')
    expect(siteUrl('/api/claim', 'https://example.com/faucet')).toBe('https://example.com/faucet/api/claim')
  })

  it('works with a bare origin', () => {
    expect(siteUrl('/api/claim', 'https://example.com/')).toBe('https://example.com/api/claim')
  })
})
