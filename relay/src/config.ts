import { z } from 'zod'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Bare origin: scheme + host[:port], no path/query/credentials. */
function isBareOrigin(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.origin === raw.replace(/\/$/, '') && !u.username && !u.password
  } catch {
    return false
  }
}

const schema = z.object({
  // Relay identity key. MUST be stable across restarts — its public key is embedded in every QR
  // and is the ECDH counterparty the phone encrypts to. Dedicated key, not the faucet treasury.
  RELAY_PRIVATE_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32-byte hex'),
  // Public https:// URL of the faucet website. Embedded in the QR as the pairing origin; the phone
  // fetches `${FAUCET_PUBLIC_URL}/api/session/:id` (proxied by the faucet to this service).
  FAUCET_PUBLIC_URL: z
    .string()
    .refine(isBareOrigin, 'must be a bare origin like https://faucet.example.com')
    .transform((v) => v.replace(/\/$/, '')),
  // Public wss:// base URL of THIS service's socket (no path — the phone appends /ws).
  RELAY_WS_URL: z
    .string()
    .refine(isBareOrigin, 'must be a bare origin like wss://relay.example.com')
    .refine((v) => {
      const u = new URL(v)
      return u.protocol === 'wss:' || (u.protocol === 'ws:' && LOOPBACK.has(u.hostname))
    }, 'must be wss:// (ws:// only on loopback)')
    .transform((v) => v.replace(/\/$/, '')),
  // Deep-link scheme the wallet app registers (bsv-wallet accepts bsv-wallet:// and bsv-browser://).
  QR_SCHEMA: z.string().regex(/^[a-z][a-z0-9+.-]*$/).default('bsv-wallet'),
  PORT: z.coerce.number().int().positive().default(8787),
})

export type RelayConfig = z.infer<typeof schema>

export function parseConfig(env: Record<string, string | undefined>): RelayConfig {
  return schema.parse(env)
}
