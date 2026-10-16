import { NextResponse } from 'next/server'
import { enabledNetworks, networkConfig } from '@/lib/config'

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url)
    return r.ok
  } catch {
    return false
  }
}

/** arcade /tx requires POST; treat a reachable host (any HTTP response) as the arcade signal. */
async function answers(url: string): Promise<boolean> {
  const r = await fetch(url).catch(() => null)
  return !!r
}

/** Healthy when every configured network's arcade and chaintracks answer. */
export async function GET() {
  const results = await Promise.all(
    enabledNetworks().map(async (network) => {
      const cfg = networkConfig(network)
      const [arcadeReachable, chaintracksReachable] = await Promise.all([
        answers(`${cfg.arcadeUrl}/health`),
        reachable(`${cfg.chaintracksUrl}/height`),
      ])
      return { network, ok: arcadeReachable && chaintracksReachable, arcadeReachable, chaintracksReachable }
    }),
  )
  const ok = results.length > 0 && results.every((r) => r.ok)
  return NextResponse.json({ ok, networks: results }, { status: ok ? 200 : 503 })
}
