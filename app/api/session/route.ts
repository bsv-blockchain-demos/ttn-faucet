import { relayFetch } from '@/lib/relay-proxy'

// Creates a pairing session — must never be prerendered or cached.
export const dynamic = 'force-dynamic'

/** Create a mobile-wallet pairing session (QR + desktop token). Proxied to the relay sidecar. */
export async function GET(req: Request) {
  return relayFetch(req, '/api/session')
}
