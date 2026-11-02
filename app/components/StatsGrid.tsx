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

/** One cell of the readout, as bsvblockchain.org's StatBand: blue display figure, label, note. */
function Readout({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="bg-surface-raised p-5 md:p-6">
      <p className="tnum font-display text-[clamp(1.75rem,1.4rem+1.4vw,2.25rem)] leading-none font-semibold tracking-tight text-primary">
        {value}
      </p>
      <p className="mt-3 text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-sm text-ink-muted">{sub}</p>
    </div>
  )
}

/**
 * Sats dispensed + Total payouts are live from /api/stats (broadcast Claim rows, all networks).
 * Treasury balance is live from /api/balance for the selected network.
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
    <div className="grid gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2 lg:grid-cols-4">
      <Readout label="Dispensed" value={dispensed} sub="sat, all networks" />
      <Readout label="Payouts" value={payouts} sub="lifetime, all networks" />
      <Readout
        label={`Treasury · ${NETWORKS[network].name}`}
        value={treasuryBsv}
        sub="BSV available"
      />
      <Readout label="Per claim" value={payoutSats.toLocaleString()} sub="sat, spendable on receipt" />
    </div>
  )
}
