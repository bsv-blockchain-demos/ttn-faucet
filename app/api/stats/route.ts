import { NextResponse } from 'next/server'
import { getFaucetStats } from '@/lib/stats'

export async function GET() {
  try {
    const stats = await getFaucetStats()
    return NextResponse.json(stats)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ payoutCount: null, totalSatsDisbursed: null, error: msg }, { status: 503 })
  }
}
