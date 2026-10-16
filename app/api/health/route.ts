import { NextResponse } from 'next/server'
import { enabledNetworks, networkConfig } from '@/lib/config'

/** Each upstream check gets this long, so one hung arcade can't outlast the readiness probe. */
const CHECK_TIMEOUT_MS = 3000

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    return r.ok
  } catch {
    return false
  }
}

/** arcade /tx requires POST; treat a reachable host (any HTTP response) as the arcade signal. */
async function answers(url: string): Promise<boolean> {
  const r = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }).catch(() => null)
  return !!r
}

/**
 * Per-network upstream health. 200 while at least one configured network can pay out, so one
 * network's outage (or a tstn chain reset) doesn't take the whole multi-network faucet out of
 * service; `degraded` flags that some network is down. 503 only when none can pay.
 */
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
  const ok = results.some((r) => r.ok)
  const degraded = results.some((r) => !r.ok)
  return NextResponse.json({ ok, degraded, networks: results }, { status: ok ? 200 : 503 })
}
