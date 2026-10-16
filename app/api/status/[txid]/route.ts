import { NextResponse } from 'next/server'
import { networkConfig, resolveNetwork } from '@/lib/config'
import { getTxStatus } from '@/lib/arcade'

/** GET /api/status/:txid?network=<id> — arcade's broadcast/mining status for a payout. */
export async function GET(req: Request, { params }: { params: Promise<{ txid: string }> }) {
  const { txid } = await params
  const net = resolveNetwork(new URL(req.url).searchParams.get('network'))
  if (!net.ok) return NextResponse.json({ error: net.error, code: net.code }, { status: net.status })
  const st = await getTxStatus(networkConfig(net.network).arcadeUrl, txid)
  if (!st) {
    return NextResponse.json({ error: 'Unknown txid', code: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ txid: st.txid, status: st.txStatus, blockHeight: st.blockHeight ?? null, network: net.network })
}
