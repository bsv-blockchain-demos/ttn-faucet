import { badId, relayFetch, safeId } from '@/lib/relay-proxy'

export const dynamic = 'force-dynamic'

/**
 * Pairing session status, proxied to the relay sidecar. This is the URL BSV Wallet fetches
 * (`${origin}/api/session/:id`) after scanning the QR, to learn the relay's wss:// address.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeId((await params).id)
  return id ? relayFetch(req, `/api/session/${id}`) : badId()
}
