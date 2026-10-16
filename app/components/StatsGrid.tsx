'use client'
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

/** One cell of the readout strip: mono label, large tabular figure, unit/context line. */
function Readout({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="border-t border-hairline py-5 min-[1000px]:px-6 min-[1000px]:first:pl-0 min-[1000px]:[&:not(:first-child)]:border-l">
      <div className="label mb-4">{label}</div>
      <div className="tnum font-display text-[32px] font-semibold leading-none tracking-[-0.03em] text-foreground">
        {value}
      </div>
      <div className="mt-2 text-[13px] text-muted-foreground">{sub}</div>
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
    <div className="grid grid-cols-1 border-b border-hairline min-[620px]:grid-cols-2 min-[620px]:gap-x-8 min-[1000px]:ml-[232px] min-[1000px]:grid-cols-4 min-[1000px]:gap-x-0">
      <Readout label="Dispensed" value={dispensed} sub="sat, all networks" />
      <Readout label="Payouts" value={payouts} sub="lifetime, all networks" />
      <Readout
        label="Treasury"
        value={treasuryBsv}
        sub={
          <span data-network={network}>
            BSV on <span className="font-medium text-net">{NETWORKS[network].name}</span>
          </span>
        }
      />
      <Readout label="Per claim" value={payoutSats.toLocaleString()} sub="sat, spendable on receipt" />
    </div>
  )
}
