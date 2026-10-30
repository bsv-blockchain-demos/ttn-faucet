import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_TURNSTILE_SITE_KEY, resetSiteUrlWarnings, resolvePublicConfig, type BuildTimeConfig } from './public-config'
import { DEFAULT_SITE_URL } from './base-path'

// No build-time values unless a test passes them, whatever the shell running the tests has set.
const resolve = (env: Record<string, string | undefined>, build: BuildTimeConfig = {}) => resolvePublicConfig(env, build)

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  resetSiteUrlWarnings()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

describe('resolvePublicConfig', () => {
  it('falls back to the defaults when nothing is set, without warning', () => {
    expect(resolve({})).toEqual({
      siteUrl: DEFAULT_SITE_URL,
      turnstileSiteKey: DEFAULT_TURNSTILE_SITE_KEY,
      turnstileRequired: false,
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('treats empty and blank values as unset', () => {
    const env = { SITE_URL: '', NEXT_PUBLIC_SITE_URL: '  ', TURNSTILE_SITE_KEY: '', NEXT_PUBLIC_TURNSTILE_SITE_KEY: ' ' }
    expect(resolve(env, { turnstileSiteKey: '' })).toMatchObject({
      siteUrl: DEFAULT_SITE_URL,
      turnstileSiteKey: DEFAULT_TURNSTILE_SITE_KEY,
    })
  })

  it('prefers the runtime vars over the deprecated names and the build-time key', () => {
    const env = {
      SITE_URL: 'https://runtime.example/faucet',
      NEXT_PUBLIC_SITE_URL: 'https://legacy.example/faucet',
      TURNSTILE_SITE_KEY: 'runtime-key',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'legacy-key',
    }
    expect(resolve(env, { turnstileSiteKey: 'build-key' })).toMatchObject({
      siteUrl: 'https://runtime.example/faucet',
      turnstileSiteKey: 'runtime-key',
    })
  })

  it('reads the deprecated NEXT_PUBLIC_* names from the runtime environment next', () => {
    const env = { NEXT_PUBLIC_SITE_URL: 'https://legacy.example/faucet', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'legacy-key' }
    expect(resolve(env, { turnstileSiteKey: 'build-key' })).toMatchObject({
      siteUrl: 'https://legacy.example/faucet',
      turnstileSiteKey: 'legacy-key',
    })
  })

  it('then takes the site key inlined at build time', () => {
    expect(resolve({}, { turnstileSiteKey: 'build-key' }).turnstileSiteKey).toBe('build-key')
  })

  it('strips trailing slashes from the site URL under either name', () => {
    expect(resolve({ SITE_URL: 'https://a.example/faucet/' }).siteUrl).toBe('https://a.example/faucet')
    expect(resolve({ NEXT_PUBLIC_SITE_URL: 'https://b.example//' }).siteUrl).toBe('https://b.example')
  })

  it('skips a site URL that is not an absolute http(s) URL', () => {
    const env = { SITE_URL: 'bsvblockchain.com/faucet', NEXT_PUBLIC_SITE_URL: 'https://legacy.example' }
    expect(resolve(env).siteUrl).toBe('https://legacy.example')
    expect(resolve({ SITE_URL: 'not a url' }).siteUrl).toBe(DEFAULT_SITE_URL)
    expect(resolve({ SITE_URL: 'ftp://a.example' }).siteUrl).toBe(DEFAULT_SITE_URL)
  })

  it('warns once per rejected value, naming the var and the value', () => {
    resolve({ SITE_URL: 'example.com/faucet' })
    resolve({ SITE_URL: 'example.com/faucet' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('SITE_URL="example.com/faucet"')

    resolve({ SITE_URL: '', NEXT_PUBLIC_SITE_URL: 'nope' })
    expect(warn).toHaveBeenCalledTimes(3)
    expect(warn.mock.calls[1][0]).toContain('SITE_URL=""')
    expect(warn.mock.calls[2][0]).toContain('NEXT_PUBLIC_SITE_URL="nope"')
  })

  it('does not warn about a deprecated name it never needed', () => {
    resolve({ SITE_URL: 'https://a.example', NEXT_PUBLIC_SITE_URL: 'nope' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('trims surrounding whitespace', () => {
    const env = { SITE_URL: ' https://a.example/faucet/ ', TURNSTILE_SITE_KEY: ' key\n' }
    expect(resolve(env)).toMatchObject({ siteUrl: 'https://a.example/faucet', turnstileSiteKey: 'key' })
  })

  it('reports Turnstile as required only for the literal true', () => {
    expect(resolve({ TURNSTILE_REQUIRED: 'true' }).turnstileRequired).toBe(true)
    expect(resolve({ TURNSTILE_REQUIRED: ' true ' }).turnstileRequired).toBe(true)
    expect(resolve({ TURNSTILE_REQUIRED: '1' }).turnstileRequired).toBe(false)
    expect(resolve({ TURNSTILE_REQUIRED: 'false' }).turnstileRequired).toBe(false)
  })
})
