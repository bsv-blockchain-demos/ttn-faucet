import { NextResponse } from 'next/server'
import { defaultNetwork, enabledNetworks } from '@/lib/config'

export const dynamic = 'force-dynamic'

/** Networks this faucet pays out on (ids from lib/networks.ts) and the one used when none is named. */
export async function GET() {
  try {
    return NextResponse.json({ networks: enabledNetworks(), default: defaultNetwork() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ networks: [], default: null, error: msg }, { status: 503 })
  }
}
