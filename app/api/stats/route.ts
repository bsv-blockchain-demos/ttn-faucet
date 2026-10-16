import { NextResponse } from 'next/server'
import { getFaucetStats } from '@/lib/stats'
import { isNetworkId } from '@/lib/networks'

export const dynamic = 'force-dynamic'

/** GET /api/stats[?network=<id>] — lifetime payout stats, for one network or all of them. */
export async function GET(req: Request) {
  try {
    const network = new URL(req.url).searchParams.get('network')
    const stats = await getFaucetStats(isNetworkId(network) ? network : undefined)
    return NextResponse.json(stats)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ payoutCount: null, totalSatsDisbursed: null, error: msg }, { status: 503 })
  }
}
