import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { getTxStatus } from '@/lib/arcade'

export async function GET(_req: Request, { params }: { params: Promise<{ txid: string }> }) {
  const { txid } = await params
  const cfg = getConfig()
  const st = await getTxStatus(cfg.ARCADE_URL, txid)
  if (!st) {
    return NextResponse.json({ error: 'Unknown txid', code: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ txid: st.txid, status: st.txStatus, blockHeight: st.blockHeight ?? null })
}
