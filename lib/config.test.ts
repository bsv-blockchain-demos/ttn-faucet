import { describe, it, expect } from 'vitest'
import { defaultNetwork, enabledNetworks, networkConfig, parseConfig, resolveNetwork } from './config'
import { TEST_ENV } from './test-config'

const shared = {
  DATABASE_URL: 'file:./prisma/dev.db',
  TURNSTILE_SECRET_KEY: 'secret',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
  FAUCET_PAYOUT_SATS: '100000',
  FAUCET_MAX_SATS: '1000000',
  RATE_LIMIT_WINDOW_MS: '3600000',
  RATE_LIMIT_MAX: '5',
  BOOTSTRAP_SPLIT_COUNT: '20',
}

/** The single-network env from before multi-network support (unprefixed vars = Teratestnet). */
const legacy = {
  ...shared,
  TREASURY_WIF: 'cVtests...',
  WALLET_ROOT_KEY_HEX: '0'.repeat(64),
  ARCADE_URL: 'http://localhost:8080',
  ARCADE_CHAINTRACKS_URL: 'http://localhost:8083/chaintracks/v2',
  WALLET_STORAGE_PATH: './data/wallet.sqlite',
}

describe('parseConfig', () => {
  it('parses a valid environment with numeric coercion', () => {
    const cfg = parseConfig(TEST_ENV)
    expect(cfg.FAUCET_PAYOUT_SATS).toBe(100000)
    expect(cfg.RATE_LIMIT_MAX).toBe(5)
  })

  it('configures each network from its prefixed vars, sharing an unprefixed root key', () => {
    const cfg = parseConfig(TEST_ENV)
    expect(enabledNetworks(cfg)).toEqual(['testnet', 'ttn'])
    expect(networkConfig('testnet', cfg)).toMatchObject({
      chain: 'test',
      arcadeUrl: 'http://arcade-testnet.test',
      walletStoragePath: './data/wallet-testnet.sqlite',
      walletRootKeyHex: '0'.repeat(64),
    })
    expect(networkConfig('ttn', cfg).chain).toBe('ttn')
    expect(() => networkConfig('tstn', cfg)).toThrow(/does not pay out on tstn/)
  })

  it('treats the legacy unprefixed vars as Teratestnet', () => {
    const cfg = parseConfig(legacy)
    expect(enabledNetworks(cfg)).toEqual(['ttn'])
    expect(networkConfig('ttn', cfg)).toMatchObject({ arcadeUrl: 'http://localhost:8080', treasuryWif: 'cVtests...' })
    expect(defaultNetwork(cfg)).toBe('ttn')
  })

  it('throws when an enabled network is missing a field', () => {
    const { TESTNET_WALLET_STORAGE_PATH, ...missing } = TEST_ENV
    expect(() => parseConfig(missing)).toThrow(/TESTNET_WALLET_STORAGE_PATH/)
  })

  it('leaves Turnstile off, and both keys optional, unless TURNSTILE_REQUIRED is the literal true', () => {
    const noKeys = { ...TEST_ENV }
    delete noKeys.TURNSTILE_SECRET_KEY
    delete noKeys.TURNSTILE_SITE_KEY
    expect(parseConfig(noKeys).TURNSTILE_REQUIRED).toBe(false)
    expect(parseConfig({ ...noKeys, TURNSTILE_REQUIRED: 'yes' }).TURNSTILE_REQUIRED).toBe(false)
    expect(parseConfig({ ...TEST_ENV, TURNSTILE_REQUIRED: ' true ' }).TURNSTILE_REQUIRED).toBe(true)
  })

  it('with TURNSTILE_REQUIRED=true, needs a secret and a site key under either name, blank counting as unset', () => {
    const required = { ...TEST_ENV, TURNSTILE_REQUIRED: 'true' }
    expect(() => parseConfig({ ...required, TURNSTILE_SECRET_KEY: ' ' })).toThrow(/TURNSTILE_SECRET_KEY/)
    expect(() => parseConfig({ ...required, TURNSTILE_SITE_KEY: '' })).toThrow(/TURNSTILE_SITE_KEY/)
    expect(() => parseConfig({ ...required, TURNSTILE_SITE_KEY: '   ' })).toThrow(/TURNSTILE_SITE_KEY/)
    expect(() =>
      parseConfig({ ...required, TURNSTILE_SITE_KEY: '', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site' }),
    ).not.toThrow()
    expect(parseConfig({ ...required, TURNSTILE_SECRET_KEY: ' sec ' }).TURNSTILE_SECRET_KEY).toBe('sec')
  })

  it('throws when no network is configured', () => {
    expect(() => parseConfig(shared)).toThrow(/No network configured/)
  })

  it('rejects payout above the max', () => {
    expect(() => parseConfig({ ...TEST_ENV, FAUCET_PAYOUT_SATS: '2000000' })).toThrow()
  })

  it('defaults RATE_LIMIT_DISABLED to true (off) and only RATE_LIMIT_DISABLED=false re-enables it', () => {
    expect(parseConfig(TEST_ENV).RATE_LIMIT_DISABLED).toBe(true) // unset → disabled
    expect(parseConfig({ ...TEST_ENV, RATE_LIMIT_DISABLED: 'true' }).RATE_LIMIT_DISABLED).toBe(true)
    expect(parseConfig({ ...TEST_ENV, RATE_LIMIT_DISABLED: 'false' }).RATE_LIMIT_DISABLED).toBe(false)
  })
})

describe('resolveNetwork', () => {
  const cfg = parseConfig(TEST_ENV)

  it('defaults to testnet when it is enabled', () => {
    expect(resolveNetwork(undefined, cfg)).toEqual({ ok: true, network: 'testnet' })
    expect(resolveNetwork('', cfg)).toEqual({ ok: true, network: 'testnet' })
  })

  it('accepts an enabled network', () => {
    expect(resolveNetwork('ttn', cfg)).toEqual({ ok: true, network: 'ttn' })
  })

  it('honours FAUCET_DEFAULT_NETWORK, which must be a configured network', () => {
    const pinned = parseConfig({ ...TEST_ENV, FAUCET_DEFAULT_NETWORK: 'ttn' })
    expect(resolveNetwork(undefined, pinned)).toEqual({ ok: true, network: 'ttn' })
    expect(() => parseConfig({ ...TEST_ENV, FAUCET_DEFAULT_NETWORK: 'tstn' })).toThrow(/not a configured network/)
    expect(defaultNetwork(parseConfig({ ...TEST_ENV, FAUCET_DEFAULT_NETWORK: '' }))).toBe('testnet') // as in .env.example
  })

  it('rejects unknown and unconfigured networks', () => {
    expect(resolveNetwork('mainnet', cfg)).toMatchObject({ ok: false, code: 'bad_request' })
    expect(resolveNetwork('tstn', cfg)).toMatchObject({ ok: false, code: 'network_unavailable' })
  })
})
