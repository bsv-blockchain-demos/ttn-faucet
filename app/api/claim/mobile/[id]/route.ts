import { NextResponse } from 'next/server'
import { badId, safeId } from '@/lib/relay-proxy'
import { mobileClaims } from '@/lib/mobile-claim-runtime'

export const dynamic = 'force-dynamic'

/** Outcome of a mobile-wallet claim: waiting | claiming | done | error | expired. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeId((await params).id)
  if (!id) return badId()
  const claims = mobileClaims()
  const view = claims.view(id)
  if (!view) return NextResponse.json({ error: 'Unknown claim', code: 'not_found' }, { status: 404 })
  if (view.state === 'waiting') void claims.check(id)
  return NextResponse.json(view, { headers: { 'cache-control': 'no-store' } })
}

/**
 * Connect notification from the relay sidecar. It only prompts a check: the claim starts only if
 * the relay itself reports the session connected, so a forged call can't do anything.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = safeId((await params).id)
  if (!id) return badId()
  await mobileClaims().check(id)
  return new NextResponse(null, { status: 202 })
}
