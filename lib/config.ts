import { z } from 'zod'
import { DEFAULT_NETWORK, NETWORK_IDS, NETWORKS, isNetworkId, type NetworkId } from './networks'

/** Blank or whitespace-only counts as unset. */
const trimmed = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined)

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    /**
     * Cloudflare Turnstile on the public claim paths. Off unless set to the literal `true`; then the
     * secret and a site key must both be set. The page reads the site key per request (lib/public-config.ts).
     */
    TURNSTILE_REQUIRED: z
      .string()
      .optional()
      .transform((v) => v?.trim() === 'true'),
    TURNSTILE_SECRET_KEY: trimmed,
    TURNSTILE_SITE_KEY: trimmed,
    /** Deprecated name for TURNSTILE_SITE_KEY, still accepted. */
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: trimmed,
    FAUCET_PAYOUT_SATS: z.coerce.number().int().positive(),
    FAUCET_MAX_SATS: z.coerce.number().int().positive(),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive(),
    // TEMP (2026-06): rate limiting is OFF by default while we iterate. The limiter code
    // (lib/rate-limit.ts, lib/guard.ts) stays intact — set RATE_LIMIT_DISABLED=false to re-enable.
    RATE_LIMIT_DISABLED: z
      .string()
      .optional()
      .transform((v) => v !== 'false'),
    BOOTSTRAP_SPLIT_COUNT: z.coerce.number().int().positive(),
    /** Where API calls without a `network` go. Unset: testnet if enabled, else the first enabled. */
    FAUCET_DEFAULT_NETWORK: z.preprocess((v) => (v === '' ? undefined : v), z.enum(NETWORK_IDS).optional()),
  })
  .refine((c) => !c.TURNSTILE_REQUIRED || c.TURNSTILE_SECRET_KEY, {
    message: 'TURNSTILE_REQUIRED=true needs TURNSTILE_SECRET_KEY',
    path: ['TURNSTILE_SECRET_KEY'],
  })
  .refine((c) => !c.TURNSTILE_REQUIRED || c.TURNSTILE_SITE_KEY || c.NEXT_PUBLIC_TURNSTILE_SITE_KEY, {
    message: 'TURNSTILE_REQUIRED=true needs TURNSTILE_SITE_KEY (or the deprecated NEXT_PUBLIC_TURNSTILE_SITE_KEY)',
    path: ['TURNSTILE_SITE_KEY'],
  })
  .refine((c) => c.FAUCET_PAYOUT_SATS <= c.FAUCET_MAX_SATS, {
    message: 'FAUCET_PAYOUT_SATS must be <= FAUCET_MAX_SATS',
    path: ['FAUCET_PAYOUT_SATS'],
  })

const networkSchema = z.object({
  WALLET_ROOT_KEY_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32-byte hex'),
  ARCADE_URL: z.string().url(),
  ARCADE_CHAINTRACKS_URL: z.string().url(),
  WALLET_STORAGE_PATH: z.string().min(1),
  TREASURY_WIF: z.string().min(1).optional(),
})

/** One network's server wallet: where it broadcasts, reads headers, and keeps its storage. */
export interface NetworkConfig {
  network: NetworkId
  chain: (typeof NETWORKS)[NetworkId]['chain']
  walletRootKeyHex: string
  arcadeUrl: string
  chaintracksUrl: string
  walletStoragePath: string
  /** Flat key holding coins to bring under wallet management — bootstrap only. */
  treasuryWif?: string
}

export type Config = z.infer<typeof schema> & {
  /** Networks this deployment pays out on; a network is enabled by setting its `{PREFIX}_ARCADE_URL`. */
  networks: Partial<Record<NetworkId, NetworkConfig>>
}

const NETWORK_KEYS = Object.keys(networkSchema.shape) as Array<keyof typeof networkSchema.shape>

/**
 * A network's raw settings: `{PREFIX}_*` vars (e.g. `TTN_ARCADE_URL`). The root key may be shared
 * via an unprefixed `WALLET_ROOT_KEY_HEX`. Unprefixed `ARCADE_URL` etc. are the single-network
 * config from before multi-network support and still configure Teratestnet when no `TTN_*` is set.
 */
function rawNetworkEnv(id: NetworkId, env: Record<string, string | undefined>): Record<string, string | undefined> | null {
  const prefix = NETWORKS[id].envPrefix
  const prefixed = Object.fromEntries(NETWORK_KEYS.map((k) => [k, env[`${prefix}_${k}`] || undefined]))
  if (prefixed.ARCADE_URL) {
    return { ...prefixed, WALLET_ROOT_KEY_HEX: prefixed.WALLET_ROOT_KEY_HEX ?? env.WALLET_ROOT_KEY_HEX }
  }
  if (id === 'ttn' && env.ARCADE_URL) return Object.fromEntries(NETWORK_KEYS.map((k) => [k, env[k] || undefined]))
  return null
}

/** Pure parser — unit-testable without touching process.env. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const shared = schema.parse(env)
  const networks: Config['networks'] = {}
  for (const id of NETWORK_IDS) {
    const raw = rawNetworkEnv(id, env)
    if (!raw) continue
    const parsed = networkSchema.safeParse(raw)
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => `${NETWORKS[id].envPrefix}_${i.path.join('.')}: ${i.message}`)
      throw new Error(`Invalid config for network ${id}: ${fields.join('; ')}`)
    }
    const n = parsed.data
    networks[id] = {
      network: id,
      chain: NETWORKS[id].chain,
      walletRootKeyHex: n.WALLET_ROOT_KEY_HEX,
      arcadeUrl: n.ARCADE_URL,
      chaintracksUrl: n.ARCADE_CHAINTRACKS_URL,
      walletStoragePath: n.WALLET_STORAGE_PATH,
      treasuryWif: n.TREASURY_WIF,
    }
  }
  if (Object.keys(networks).length === 0) {
    throw new Error('No network configured: set TESTNET_ARCADE_URL, TTN_ARCADE_URL or TSTN_ARCADE_URL (and its siblings)')
  }
  if (shared.FAUCET_DEFAULT_NETWORK && !networks[shared.FAUCET_DEFAULT_NETWORK]) {
    throw new Error(`FAUCET_DEFAULT_NETWORK=${shared.FAUCET_DEFAULT_NETWORK} is not a configured network`)
  }
  return { ...shared, networks }
}

let cached: Config | null = null
/** Singleton accessor for app code. Throws at first use if env is invalid. */
export function getConfig(): Config {
  if (!cached) cached = parseConfig(process.env)
  return cached
}

/** Thrown when a request names a network this deployment doesn't serve. */
export class NetworkUnavailableError extends Error {
  constructor(readonly network: string) {
    super(`This faucet does not pay out on ${network}`)
    this.name = 'NetworkUnavailableError'
  }
}

/** The enabled networks, in display order. */
export function enabledNetworks(cfg: Config = getConfig()): NetworkId[] {
  return NETWORK_IDS.filter((id) => cfg.networks[id])
}

/**
 * Where a request without a `network` goes: FAUCET_DEFAULT_NETWORK, else testnet if enabled, else
 * the first enabled. Pin FAUCET_DEFAULT_NETWORK when adding a network to a live deployment, so
 * existing API clients that send no `network` keep getting the same one.
 */
export function defaultNetwork(cfg: Config = getConfig()): NetworkId {
  if (cfg.FAUCET_DEFAULT_NETWORK) return cfg.FAUCET_DEFAULT_NETWORK
  return cfg.networks[DEFAULT_NETWORK] ? DEFAULT_NETWORK : enabledNetworks(cfg)[0]
}

export function networkConfig(id: NetworkId, cfg: Config = getConfig()): NetworkConfig {
  const n = cfg.networks[id]
  if (!n) throw new NetworkUnavailableError(id)
  return n
}

export type NetworkResolution =
  | { ok: true; network: NetworkId }
  | { ok: false; status: 400; code: 'bad_request' | 'network_unavailable'; error: string }

/**
 * The network a request asked for (a `network` body field or query param). Omitted means the
 * deployment's default network, so single-network API clients keep working unchanged.
 */
export function resolveNetwork(raw: unknown, cfg: Config = getConfig()): NetworkResolution {
  if (raw === undefined || raw === null || raw === '') return { ok: true, network: defaultNetwork(cfg) }
  if (!isNetworkId(raw)) {
    return { ok: false, status: 400, code: 'bad_request', error: `Unknown network. Use one of: ${NETWORK_IDS.join(', ')}` }
  }
  if (!cfg.networks[raw]) {
    return {
      ok: false,
      status: 400,
      code: 'network_unavailable',
      error: `This faucet does not pay out on ${raw}. Available: ${enabledNetworks(cfg).join(', ')}`,
    }
  }
  return { ok: true, network: raw }
}
