'use client'
import { ArrowRightIcon } from './icons'
import { NetworkIcon } from './NetworkIcon'
import { useNetwork } from './NetworkProvider'

const fmt = (n: number) => n.toLocaleString()

/**
 * CTA content for the primary button: the amount, an "on <network>" line with the network's icon,
 * and an arrow — so the button still says which network it pays on.
 */
export function ClaimLabel({
  payoutSats,
  networkName,
  verb = 'Claim',
}: {
  payoutSats: number
  networkName: string
  verb?: string
}) {
  const { network } = useNetwork()
  return (
    <>
      <span className="flex flex-1 flex-col justify-center py-2.5 leading-tight">
        <span className="tnum text-[0.9375rem] font-medium">
          {verb} {fmt(payoutSats)} sat
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium opacity-80">
          <NetworkIcon network={network} className="size-3.5" />
          on {networkName}
        </span>
      </span>
      <ArrowRightIcon size={18} className="flex-none transition-transform duration-150 group-hover:translate-x-0.5" />
    </>
  )
}

/** Busy state for the same button: label only, padded like ClaimLabel. */
export function BusyLabel({ children }: { children: React.ReactNode }) {
  return <span className="flex flex-1 items-center justify-center py-3 text-[0.9375rem] font-medium">{children}</span>
}
