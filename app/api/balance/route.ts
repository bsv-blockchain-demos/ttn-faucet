import { NextResponse } from 'next/server'
import { resolveNetwork } from '@/lib/config'
import { getFaucetBalanceSats } from '@/lib/wallet'

export const dynamic = 'force-dynamic'

/** GET /api/balance?network=<id> — the faucet wallet's spendable balance on that network. */
export async function GET(req: Request) {
  try {
    const net = resolveNetwork(new URL(req.url).searchParams.get('network'))
    if (!net.ok) return NextResponse.json({ balanceSats: null, error: net.error, code: net.code }, { status: net.status })
    const balanceSats = await getFaucetBalanceSats(net.network)
    return NextResponse.json({ balanceSats, network: net.network })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ balanceSats: null, error: msg }, { status: 503 })
  }
}
