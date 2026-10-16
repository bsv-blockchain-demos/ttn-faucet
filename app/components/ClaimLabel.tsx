import { ArrowRightIcon } from './icons'

const fmt = (n: number) => n.toLocaleString()

/** CTA label: amount, then the network as a mono readout line; the arrow sits at the right edge. */
export function ClaimLabel({ payoutSats, networkName, verb = 'Claim' }: { payoutSats: number; networkName: string; verb?: string }) {
  return (
    <>
      <span className="flex flex-col items-start py-2 leading-tight">
        <span className="tnum">
          {verb} {fmt(payoutSats)} sat
        </span>
        <span className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] opacity-80">
          on {networkName}
        </span>
      </span>
      <ArrowRightIcon size={18} className="flex-none" />
    </>
  )
}
