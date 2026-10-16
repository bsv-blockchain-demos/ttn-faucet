import { ArrowRightIcon } from './icons'

const fmt = (n: number) => n.toLocaleString()

/**
 * CTA content for an ink button: the amount, a mono "on <network>" line, and a square block in the
 * network colour holding the arrow — so the button still says which network it pays on.
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
  return (
    <>
      <span className="flex flex-1 flex-col justify-center py-3 pl-5 leading-tight">
        <span className="tnum">
          {verb} {fmt(payoutSats)} sat
        </span>
        <span className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] opacity-75">
          on {networkName}
        </span>
      </span>
      <span className="flex w-16 flex-none items-center justify-center bg-net text-net-fg" aria-hidden>
        <ArrowRightIcon size={22} className="transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </>
  )
}

/** Busy state for the same button: label only, padded like ClaimLabel. */
export function BusyLabel({ children }: { children: React.ReactNode }) {
  return <span className="flex flex-1 items-center py-3 pl-5">{children}</span>
}
