import { NextResponse } from 'next/server'
import { z } from 'zod'
import { guard, hashIp } from '@/lib/guard'
import { claimToAddress } from '@/lib/faucet'
import { payToAddress } from '@/lib/wallet'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
}

const BodySchema = z.object({
  address: z.string().min(26).max(64),
  amount: z.number().int().positive().optional(),
  // Turnstile temporarily disabled (see lib/guard.ts); token is unused server-side, so accept "" too.
  captchaToken: z.string().optional(),
})

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', code: 'bad_request' }, { status: 400, headers: CORS })
  }
  const ip = clientIp(req)
  const apiKey = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || undefined
  const idempotencyKey = req.headers.get('idempotency-key') || undefined

  const g = await guard({ ip, captchaToken: parsed.data.captchaToken, apiKey })
  if (!g.ok) {
    const headers: Record<string, string> = { ...CORS }
    if (g.code === 'rate_limit' && g.retryAfterMs) headers['Retry-After'] = String(Math.ceil(g.retryAfterMs / 1000))
    return NextResponse.json({ error: g.message, code: g.code }, { status: g.status, headers })
  }

  try {
    const result = await claimToAddress(
      {
        address: parsed.data.address,
        amountSats: parsed.data.amount,
        ipHash: g.apiKeyId ? `apikey:${g.apiKeyId}` : hashIp(ip),
        apiKeyId: g.apiKeyId,
        idempotencyKey,
      },
      { pay: payToAddress },
    )
    return NextResponse.json(
      {
        txid: result.txid,
        ef: result.ef,
        outputs: [{ vout: 0, satoshis: result.amountSats, address: parsed.data.address }],
        network: 'teratestnet',
      },
      { status: 200, headers: CORS },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    if (/address/i.test(msg)) {
      return NextResponse.json({ error: msg, code: 'bad_request' }, { status: 400, headers: CORS })
    }
    return NextResponse.json({ error: `Faucet error: ${msg}`, code: 'faucet_error' }, { status: 503, headers: CORS })
  }
}
