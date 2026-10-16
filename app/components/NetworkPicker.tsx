'use client'
import { NETWORK_IDS, NETWORKS } from '@/lib/networks'
import { useNetwork } from './NetworkProvider'

/**
 * Which network to pay out on. Each option wears its network's colour (see [data-network] in
 * globals.css), and the selected one restates it below so a wrong pick is hard to miss. Locked
 * while a claim is in progress so the network can't change under it.
 */
export function NetworkPicker({ locked = false }: { locked?: boolean }) {
  const { network, setNetwork, available } = useNetwork()
  const info = NETWORKS[network]

  return (
    <fieldset className="min-w-0" disabled={locked}>
      <legend className="mb-2 text-[12.5px] font-medium text-muted-foreground">Network</legend>
      <div role="radiogroup" aria-label="Network" className="grid grid-cols-3 gap-[6px] rounded-[14px] bg-muted p-[5px]">
        {NETWORK_IDS.map((id) => {
          const selected = id === network
          const offered = available === undefined || available.includes(id)
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-network={id}
              disabled={!offered || locked}
              title={offered ? NETWORKS[id].blurb : 'Not offered by this faucet'}
              onClick={() => setNetwork(id)}
              className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-[10px] px-1.5 py-1 text-[13px] font-semibold leading-tight transition-colors disabled:cursor-not-allowed ${
                selected
                  ? 'border-[1.5px] border-net bg-card text-foreground shadow-card'
                  : offered
                    ? 'border-[1.5px] border-transparent text-muted-foreground hover:text-foreground'
                    : 'border-[1.5px] border-transparent text-muted-foreground opacity-40'
              }`}
            >
              <span className="h-2.5 w-2.5 flex-none rounded-full bg-net" aria-hidden />
              <span className="text-center">{NETWORKS[id].name}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-[12.5px] leading-snug text-muted-foreground" aria-live="polite">
        Coins go out on <span className="font-semibold text-net">{info.name}</span>. Your wallet must be on{' '}
        {info.name} too, or the coins won&apos;t show up.
      </p>
    </fieldset>
  )
}
