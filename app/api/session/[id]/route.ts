import { badId, relayFetch, safeId } from '@/lib/relay-proxy'

export const dynamic = 'force-dynamic'

/**
 * Pairing session status. Also the URL the phone fetches (`${origin}/api/session/:id`) to learn
 * the relay's wss:// address after scanning the QR.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeId((await params).id)
  return id ? relayFetch(req, `/api/session/${id}`) : badId()
}

/** End a pairing session (requires X-Desktop-Token). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeId((await params).id)
  return id ? relayFetch(req, `/api/session/${id}`) : badId()
}
