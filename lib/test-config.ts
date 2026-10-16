// Test-only: lib/config bound to a fixed two-network env (testnet + ttn; tstn not configured), so
// route tests exercise the real network resolution. Use from a vi.mock factory:
//   vi.mock('@/lib/config', async (orig) => (await import('@/lib/test-config')).mockConfigModule(await orig()))
// (Takes the real module as an argument: importing it here would load the mock itself.)
import type * as Config from './config'

export const TEST_ENV: Record<string, string> = {
  DATABASE_URL: 'file:./prisma/dev.db',
  TURNSTILE_SECRET_KEY: 'secret',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
  FAUCET_PAYOUT_SATS: '100000',
  FAUCET_MAX_SATS: '1000000',
  RATE_LIMIT_WINDOW_MS: '3600000',
  RATE_LIMIT_MAX: '5',
  BOOTSTRAP_SPLIT_COUNT: '20',
  WALLET_ROOT_KEY_HEX: '0'.repeat(64),
  TESTNET_ARCADE_URL: 'http://arcade-testnet.test',
  TESTNET_ARCADE_CHAINTRACKS_URL: 'http://arcade-testnet.test/chaintracks/v2',
  TESTNET_WALLET_STORAGE_PATH: './data/wallet-testnet.sqlite',
  TTN_ARCADE_URL: 'http://arcade-ttn.test',
  TTN_ARCADE_CHAINTRACKS_URL: 'http://arcade-ttn.test/chaintracks/v2',
  TTN_WALLET_STORAGE_PATH: './data/wallet-ttn.sqlite',
}

export function mockConfigModule(real: typeof Config): typeof Config {
  const cfg = real.parseConfig(TEST_ENV)
  return {
    ...real,
    getConfig: () => cfg,
    enabledNetworks: () => real.enabledNetworks(cfg),
    defaultNetwork: () => real.defaultNetwork(cfg),
    networkConfig: (id) => real.networkConfig(id, cfg),
    resolveNetwork: (raw) => real.resolveNetwork(raw, cfg),
  }
}
