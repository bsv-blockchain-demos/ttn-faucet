import { describe, it, expect } from 'vitest'
import { DEFAULT_TURNSTILE_SITE_KEY, resolvePublicConfig } from './public-config'
import { DEFAULT_SITE_URL } from './base-path'

// No build-time values unless a test passes them, whatever the shell running the tests has set.
const resolve = (env: Record<string, string | undefined>, build = {}) => resolvePublicConfig(env, build)

describe('resolvePublicConfig', () => {
  it('falls back to the defaults when nothing is set', () => {
    expect(resolve({})).toEqual({
      siteUrl: DEFAULT_SITE_URL,
      turnstileSiteKey: DEFAULT_TURNSTILE_SITE_KEY,
    })
  })

  it('treats empty and blank values as unset', () => {
    const env = { SITE_URL: '', NEXT_PUBLIC_SITE_URL: '  ', TURNSTILE_SITE_KEY: '', NEXT_PUBLIC_TURNSTILE_SITE_KEY: ' ' }
    expect(resolve(env, { siteUrl: '', turnstileSiteKey: '' })).toEqual({
      siteUrl: DEFAULT_SITE_URL,
      turnstileSiteKey: DEFAULT_TURNSTILE_SITE_KEY,
    })
  })

  it('prefers the runtime vars over the deprecated names and the build-time values', () => {
    const env = {
      SITE_URL: 'https://runtime.example/faucet',
      NEXT_PUBLIC_SITE_URL: 'https://legacy.example/faucet',
      TURNSTILE_SITE_KEY: 'runtime-key',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'legacy-key',
    }
    const build = { siteUrl: 'https://build.example/faucet', turnstileSiteKey: 'build-key' }
    expect(resolve(env, build)).toEqual({
      siteUrl: 'https://runtime.example/faucet',
      turnstileSiteKey: 'runtime-key',
    })
  })

  it('reads the deprecated NEXT_PUBLIC_* names from the runtime environment next', () => {
    const env = { NEXT_PUBLIC_SITE_URL: 'https://legacy.example/faucet', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'legacy-key' }
    const build = { siteUrl: 'https://build.example/faucet', turnstileSiteKey: 'build-key' }
    expect(resolve(env, build)).toEqual({
      siteUrl: 'https://legacy.example/faucet',
      turnstileSiteKey: 'legacy-key',
    })
  })

  it('then takes the values inlined at build time', () => {
    const build = { siteUrl: 'https://build.example/faucet', turnstileSiteKey: 'build-key' }
    expect(resolve({}, build)).toEqual({
      siteUrl: 'https://build.example/faucet',
      turnstileSiteKey: 'build-key',
    })
  })

  it('strips trailing slashes from the site URL at every tier', () => {
    expect(resolve({ SITE_URL: 'https://a.example/faucet/' }).siteUrl).toBe('https://a.example/faucet')
    expect(resolve({ NEXT_PUBLIC_SITE_URL: 'https://b.example//' }).siteUrl).toBe('https://b.example')
    expect(resolve({}, { siteUrl: 'https://c.example/faucet/' }).siteUrl).toBe('https://c.example/faucet')
  })

  it('skips a site URL that is not an absolute http(s) URL', () => {
    const env = { SITE_URL: 'bsvblockchain.com/faucet', NEXT_PUBLIC_SITE_URL: 'ftp://legacy.example' }
    expect(resolve(env, { siteUrl: 'https://build.example' }).siteUrl).toBe('https://build.example')
    expect(resolve({ SITE_URL: 'not a url' }).siteUrl).toBe(DEFAULT_SITE_URL)
  })

  it('trims surrounding whitespace', () => {
    const env = { SITE_URL: ' https://a.example/faucet/ ', TURNSTILE_SITE_KEY: ' key\n' }
    expect(resolve(env)).toEqual({ siteUrl: 'https://a.example/faucet', turnstileSiteKey: 'key' })
  })
})
