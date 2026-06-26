import { z } from 'zod'

const schema = z
  .object({
    TREASURY_WIF: z.string().min(1),
    WALLET_ROOT_KEY_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32-byte hex'),
    ARCADE_URL: z.string().url(),
    ARCADE_CHAINTRACKS_URL: z.string().url(),
    WALLET_STORAGE_PATH: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
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
  })
  .refine((c) => c.FAUCET_PAYOUT_SATS <= c.FAUCET_MAX_SATS, {
    message: 'FAUCET_PAYOUT_SATS must be <= FAUCET_MAX_SATS',
    path: ['FAUCET_PAYOUT_SATS'],
  })

export type Config = z.infer<typeof schema>

/** Pure parser — unit-testable without touching process.env. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  return schema.parse(env)
}

let cached: Config | null = null
/** Singleton accessor for app code. Throws at first use if env is invalid. */
export function getConfig(): Config {
  if (!cached) cached = parseConfig(process.env)
  return cached
}

/** teratestnet is modeled as toolbox chain 'test'. */
export const CHAIN = 'test' as const
