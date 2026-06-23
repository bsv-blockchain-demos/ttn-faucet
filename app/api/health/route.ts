import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url)
    return r.ok
  } catch {
    return false
  }
}

export async function GET() {
  const cfg = getConfig()
  const [chaintracksOk] = await Promise.all([reachable(`${cfg.ARCADE_CHAINTRACKS_URL}/height`)])
  // arcade /tx requires POST; treat a reachable host (any HTTP response) as the arcade signal.
  let arcadeReachable = false
  try {
    const r = await fetch(`${cfg.ARCADE_URL}/health`).catch(() => null)
    arcadeReachable = !!r // any response (even non-2xx) means the host answered
  } catch {
    arcadeReachable = false
  }
  const ok = chaintracksOk && arcadeReachable
  return NextResponse.json(
    { ok, network: 'teratestnet', arcadeReachable, chaintracksReachable: chaintracksOk },
    { status: ok ? 200 : 503 },
  )
}
