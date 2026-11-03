import { NextResponse } from 'next/server'
import { RelayError, relayEnabled } from '@/lib/relay-api'
import { mobileClaims } from '@/lib/mobile-claim-runtime'
import { resolveNetwork } from '@/lib/config'
import { checkCaptcha } from '@/lib/guard'

export const dynamic = 'force-dynamic'

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

/**
 * Start a mobile-wallet claim on the body's `network` (default network if omitted): returns a pairing QR / deep link for BSV Wallet. The claim itself
 * (guard, payout, delivery) runs server-side as soon as the phone connects; poll
 * GET /api/claim/mobile/:sessionId for the outcome.
 *
 * With TURNSTILE_REQUIRED on, the body's `captchaToken` is verified here, before the session
 * exists: the claim runs later, server-side, when no browser token is at hand.
 */
export async function POST(req: Request) {
  if (!relayEnabled()) {
    return NextResponse.json({ error: 'Mobile wallet pairing is not enabled', code: 'relay_disabled' }, { status: 503 })
  }
  const body = await req.json().catch(() => ({}))
  const net = resolveNetwork(body?.network)
  if (!net.ok) return NextResponse.json({ error: net.error, code: net.code }, { status: net.status })
  const ip = clientIp(req)
  const captcha = await checkCaptcha(typeof body?.captchaToken === 'string' ? body.captchaToken : undefined, ip)
  if (captcha && !captcha.ok) return NextResponse.json({ error: captcha.message, code: captcha.code }, { status: captcha.status })
  try {
    return NextResponse.json(await mobileClaims().create(ip, net.network), { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    const code = e instanceof RelayError ? e.code : undefined
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg, code: 'relay_error' }, { status: code === 429 ? 429 : 502 })
  }
}
