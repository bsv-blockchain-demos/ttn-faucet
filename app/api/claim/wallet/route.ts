import { NextResponse } from 'next/server'
import { z } from 'zod'
import { guard, hashIp } from '@/lib/guard'
import { claimToWallet } from '@/lib/faucet'
import { payToWallet } from '@/lib/wallet'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const BodySchema = z.object({
  identityKey: z.string().regex(/^0[23][0-9a-fA-F]{64}$/, 'Invalid identity key'),
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

  const g = await guard({ ip, captchaToken: parsed.data.captchaToken, apiKey })
  if (!g.ok) {
    const headers: Record<string, string> = { ...CORS }
    if (g.code === 'rate_limit' && g.retryAfterMs) headers['Retry-After'] = String(Math.ceil(g.retryAfterMs / 1000))
    return NextResponse.json({ error: g.message, code: g.code }, { status: g.status, headers })
  }

  try {
    const result = await claimToWallet(
      {
        identityKey: parsed.data.identityKey,
        amountSats: parsed.data.amount,
        ipHash: g.apiKeyId ? `apikey:${g.apiKeyId}` : hashIp(ip),
        apiKeyId: g.apiKeyId,
      },
      { payWallet: payToWallet },
    )
    return NextResponse.json(
      {
        txid: result.txid,
        atomicBEEF: result.atomicBEEF,
        derivationPrefix: result.derivationPrefix,
        derivationSuffix: result.derivationSuffix,
        senderIdentityKey: result.senderIdentityKey,
        outputIndex: result.outputIndex,
        amount: result.amountSats,
        network: 'teratestnet',
      },
      { status: 200, headers: CORS },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    if (/identity key|public key|pubkey/i.test(msg)) {
      return NextResponse.json({ error: msg, code: 'bad_request' }, { status: 400, headers: CORS })
    }
    return NextResponse.json({ error: `Faucet error: ${msg}`, code: 'faucet_error' }, { status: 503, headers: CORS })
  }
}
