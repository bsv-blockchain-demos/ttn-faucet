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
      <legend className="label mb-2">01 · Network</legend>
      <div role="radiogroup" aria-label="Network" className="grid grid-cols-3 gap-[3px] rounded-panel bg-muted p-[3px]">
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
              className={`flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-input border px-1.5 py-1 text-[13px] font-medium leading-tight transition-colors disabled:cursor-not-allowed ${
                selected
                  ? 'border-net bg-card text-foreground'
                  : offered
                    ? 'border-transparent text-muted-foreground hover:text-foreground'
                    : 'border-transparent text-muted-foreground opacity-40'
              }`}
            >
              <span className="h-2 w-2 flex-none rounded-[2px] bg-net" aria-hidden />
              <span className="text-center">{NETWORKS[id].name}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground" aria-live="polite">
        Coins go out on <span className="font-semibold text-net">{info.name}</span>. Your wallet must be on{' '}
        {info.name} too, or the coins won&apos;t show up.
      </p>
    </fieldset>
  )
}
