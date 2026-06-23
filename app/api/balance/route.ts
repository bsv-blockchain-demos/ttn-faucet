import { NextResponse } from 'next/server'
import { getFaucetBalanceSats } from '@/lib/wallet'

export async function GET() {
  try {
    const balanceSats = await getFaucetBalanceSats()
    return NextResponse.json({ balanceSats, network: 'teratestnet' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ balanceSats: null, error: msg }, { status: 503 })
  }
}
