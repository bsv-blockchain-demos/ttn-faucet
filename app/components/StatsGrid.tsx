'use client'
import { useFaucetBalanceSats } from './FaucetBalance'

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 p-5 ${
        highlight
          ? 'bg-gradient-to-br from-brand-500/15 to-transparent'
          : 'bg-surface'
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-white/45">{sub}</div>
    </div>
  )
}

/**
 * Treasury balance is live (polled /api/balance). The other three are static marketing
 * placeholders for now — swap to real counters/endpoints later if desired.
 */
export function StatsGrid() {
  const sats = useFaucetBalanceSats()
  const treasuryBsv =
    sats === undefined ? '…' : sats === null ? 'n/a' : (sats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard
        label="Sats dispensed"
        value="184,320,000"
        sub={<span className="text-accent-400">▲ live</span>}
      />
      <StatCard label="Claims today" value="1,287" sub="across all subjects" />
      <StatCard label="Treasury balance" value={treasuryBsv} sub="BSV · refilled nightly" highlight />
      <StatCard label="Network throughput" value="1.04M tps" sub="peak on Teranode testnet" highlight />
    </div>
  )
}
