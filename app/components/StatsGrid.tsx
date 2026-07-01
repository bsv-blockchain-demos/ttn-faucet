'use client'
import { useEffect, useState } from 'react'
import { useFaucetBalanceSats } from './FaucetBalance'

type Stats = { payoutCount: number; totalSatsDisbursed: number }

/** Polls /api/stats every 30s for lifetime payout count + sats disbursed. */
function useFaucetStats(): Stats | undefined {
  const [stats, setStats] = useState<Stats | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/stats')
        const json = await res.json()
        if (alive && typeof json.payoutCount === 'number' && typeof json.totalSatsDisbursed === 'number') {
          setStats({ payoutCount: json.payoutCount, totalSatsDisbursed: json.totalSatsDisbursed })
        }
      } catch {
        /* keep last value */
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return stats
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
}) {
  return (
    <div className="lift rounded-panel border border-hairline bg-card p-5">
      <div className="mb-3 inline-block rounded-md bg-accent px-2 py-[3px] text-[11px] font-medium text-accent-foreground">
        {label}
      </div>
      <div className="tnum font-display text-[27px] font-semibold text-foreground">{value}</div>
      <div className="mt-1.5 text-[11.5px]">{sub}</div>
    </div>
  )
}

/**
 * Sats dispensed + Total payouts are live from /api/stats (broadcast Claim rows). Treasury
 * balance is live from /api/balance. Network throughput is an intentionally static marketing figure.
 */
export function StatsGrid() {
  const sats = useFaucetBalanceSats()
  const stats = useFaucetStats()

  const treasuryBsv =
    sats === undefined
      ? '…'
      : sats === null
      ? 'n/a'
      : (sats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const dispensed = stats === undefined ? '…' : stats.totalSatsDisbursed.toLocaleString()
  const payouts = stats === undefined ? '…' : stats.payoutCount.toLocaleString()

  return (
    <div className="grid grid-cols-1 gap-4 min-[620px]:grid-cols-2 min-[880px]:grid-cols-4">
      <StatCard
        label="Sats dispensed"
        value={dispensed}
        sub={<span className="font-medium text-pos">▲ live</span>}
      />
      <StatCard
        label="Total payouts"
        value={payouts}
        sub={<span className="text-muted-foreground">across all subjects</span>}
      />
      <StatCard
        label="Treasury balance"
        value={treasuryBsv}
        sub={<span className="text-muted-foreground">BSV · refilled nightly</span>}
      />
      <StatCard
        label="Network throughput"
        value="1.04M tps"
        sub={<span className="text-muted-foreground">peak on Teranode testnet</span>}
      />
    </div>
  )
}
