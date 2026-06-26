import { describe, it, expect } from 'vitest'
import { parseConfig } from './config'

const base = {
  TREASURY_WIF: 'cVtests...',
  WALLET_ROOT_KEY_HEX: '0'.repeat(64),
  ARCADE_URL: 'http://localhost:8080',
  ARCADE_CHAINTRACKS_URL: 'http://localhost:8083/chaintracks/v2',
  WALLET_STORAGE_PATH: './data/wallet.sqlite',
  DATABASE_URL: 'file:./prisma/dev.db',
  TURNSTILE_SECRET_KEY: 'secret',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
  FAUCET_PAYOUT_SATS: '100000',
  FAUCET_MAX_SATS: '1000000',
  RATE_LIMIT_WINDOW_MS: '3600000',
  RATE_LIMIT_MAX: '5',
  BOOTSTRAP_SPLIT_COUNT: '20',
}

describe('parseConfig', () => {
  it('parses a valid environment with numeric coercion', () => {
    const cfg = parseConfig(base)
    expect(cfg.FAUCET_PAYOUT_SATS).toBe(100000)
    expect(cfg.RATE_LIMIT_MAX).toBe(5)
    expect(cfg.ARCADE_URL).toBe('http://localhost:8080')
  })

  it('throws when a required field is missing', () => {
    const { ARCADE_URL, ...missing } = base
    expect(() => parseConfig(missing as Record<string, string>)).toThrow()
  })

  it('rejects payout above the max', () => {
    expect(() => parseConfig({ ...base, FAUCET_PAYOUT_SATS: '2000000' })).toThrow()
  })

  it('defaults RATE_LIMIT_DISABLED to true (off) and only RATE_LIMIT_DISABLED=false re-enables it', () => {
    expect(parseConfig(base).RATE_LIMIT_DISABLED).toBe(true) // unset → disabled
    expect(parseConfig({ ...base, RATE_LIMIT_DISABLED: 'true' }).RATE_LIMIT_DISABLED).toBe(true)
    expect(parseConfig({ ...base, RATE_LIMIT_DISABLED: 'false' }).RATE_LIMIT_DISABLED).toBe(false)
  })
})
