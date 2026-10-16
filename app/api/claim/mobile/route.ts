import { NextResponse } from 'next/server'
import { RelayError, relayEnabled } from '@/lib/relay-api'
import { mobileClaims } from '@/lib/mobile-claim-runtime'
import { resolveNetwork } from '@/lib/config'

export const dynamic = 'force-dynamic'

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

/**
 * Start a mobile-wallet claim on the body's `network` (default network if omitted): returns a pairing QR / deep link for BSV Wallet. The claim itself
 * (guard, payout, delivery) runs server-side as soon as the phone connects; poll
 * GET /api/claim/mobile/:sessionId for the outcome.
 *
 * TODO: when Turnstile is re-enabled, verify a captcha token here before creating the session.
 */
export async function POST(req: Request) {
  if (!relayEnabled()) {
    return NextResponse.json({ error: 'Mobile wallet pairing is not enabled', code: 'relay_disabled' }, { status: 503 })
  }
  const body = await req.json().catch(() => ({}))
  const net = resolveNetwork(body?.network)
  if (!net.ok) return NextResponse.json({ error: net.error, code: net.code }, { status: net.status })
  try {
    return NextResponse.json(await mobileClaims().create(clientIp(req), net.network), { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    const code = e instanceof RelayError ? e.code : undefined
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg, code: 'relay_error' }, { status: code === 429 ? 429 : 502 })
  }
}
