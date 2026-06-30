'use client'
import { useFaucetBalanceSats } from './FaucetBalance'

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
 * Treasury balance is live (polled /api/balance). The other three are marketing
 * figures kept as-is per the client.
 */
export function StatsGrid() {
  const sats = useFaucetBalanceSats()
  const treasuryBsv =
    sats === undefined
      ? '…'
      : sats === null
      ? 'n/a'
      : (sats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="grid grid-cols-1 gap-4 min-[620px]:grid-cols-2 min-[880px]:grid-cols-4">
      <StatCard
        label="Sats dispensed"
        value="184,320,000"
        sub={<span className="font-medium text-pos">▲ live</span>}
      />
      <StatCard
        label="Claims today"
        value="1,287"
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
