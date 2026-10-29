'use client'
import { withBasePath } from '@/lib/base-path'
import { useEffect, useState } from 'react'
import { useFaucetBalanceSats } from './FaucetBalance'
import { useNetwork } from './NetworkProvider'
import { NETWORKS } from '@/lib/networks'

type Stats = { payoutCount: number; totalSatsDisbursed: number }

/** Polls /api/stats every 30s for lifetime payout count + sats disbursed. */
function useFaucetStats(): Stats | undefined {
  const [stats, setStats] = useState<Stats | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(withBasePath('/api/stats'))
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

/** One solid block of the readout: mono label top, oversized tabular figure, context line. */
function Readout({
  label,
  value,
  sub,
  panel,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  panel: string
}) {
  return (
    <div className={`${panel} flex min-h-[200px] flex-col justify-between gap-8 rounded-card p-6 transition-colors`}>
      <div className="label">{label}</div>
      <div>
        <div className="tnum font-display text-[clamp(36px,4.4vw,56px)] font-semibold leading-none tracking-[-0.045em] text-foreground">
          {value}
        </div>
        <div className="mt-3 text-[14px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  )
}

/**
 * Sats dispensed + Total payouts are live from /api/stats (broadcast Claim rows, all networks).
 * Treasury balance is live from /api/balance for the selected network, on a network-coloured block.
 */
export function StatsGrid({ payoutSats }: { payoutSats: number }) {
  const { network } = useNetwork()
  const sats = useFaucetBalanceSats(network)
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
    <div data-network={network} className="grid grid-cols-1 gap-2 min-[620px]:grid-cols-2 min-[1000px]:grid-cols-4">
      <Readout panel="on-ink" label="Dispensed" value={dispensed} sub="sat, all networks" />
      <Readout panel="bg-card" label="Payouts" value={payouts} sub="lifetime, all networks" />
      <Readout panel="on-net" label={`Treasury · ${NETWORKS[network].name}`} value={treasuryBsv} sub="BSV available" />
      <Readout panel="bg-muted" label="Per claim" value={payoutSats.toLocaleString()} sub="sat, spendable on receipt" />
    </div>
  )
}
