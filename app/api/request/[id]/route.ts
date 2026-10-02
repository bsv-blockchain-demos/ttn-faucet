import { badId, relayFetch, safeId } from '@/lib/relay-proxy'

export const dynamic = 'force-dynamic'

/** Relay a wallet call ({ method, params }) to the paired phone (requires X-Desktop-Token). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeId((await params).id)
  return id ? relayFetch(req, `/api/request/${id}`) : badId()
}
