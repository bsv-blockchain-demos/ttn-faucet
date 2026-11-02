'use client'
import { NETWORK_IDS, NETWORKS, type NetworkId } from '@/lib/networks'
import { useNetwork } from './NetworkProvider'
import { NetworkIcon } from './NetworkIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { SEGMENT_TRACK, segmentCls } from './buttons'
import { TermPill } from './TermPill'
import type { Term } from '@/lib/glossary'

/**
 * Which network to pay out on, as the site's chip buttons. Each option carries its network's icon
 * in its colour (see NetworkIcon and [data-network] in globals.css), and the line below restates the
 * pick in that colour so a wrong pick is hard to miss. Locked
 * while a claim is in progress so the network can't change under it.
 */
/** A network as a glossary term: its sentence, and its block explorer to read more, where it has one. */
function networkTerm(id: NetworkId): Term {
  const n = NETWORKS[id]
  return {
    term: n.name,
    definition: n.blurb,
    brcNumbers: [],
    more: n.explorer ? { label: `Open the ${n.name} explorer`, href: n.explorer } : undefined,
  }
}

export function NetworkPicker({ locked = false }: { locked?: boolean }) {
  const { network, setNetwork, available } = useNetwork()
  const info = NETWORKS[network]
  const unserved = available ? NETWORK_IDS.filter((id) => !available.includes(id)) : []
  const unservedNames = unserved.map((id) => NETWORKS[id].name)

  return (
    <fieldset className="min-w-0" disabled={locked}>
      <legend className="label mb-3">Network</legend>
      <div role="radiogroup" aria-label="Network" className={`grid grid-cols-3 gap-1 ${SEGMENT_TRACK}`}>
        {NETWORK_IDS.map((id) => {
          const selected = id === network
          const offered = available === undefined || available.includes(id)
          const disabled = !offered || locked
          return (
            <Tooltip key={id}>
              {/* The wrapper is the trigger: a disabled button gets no pointer events, and the
                  networks this faucet doesn't serve need their explanation most. Unserved ones are
                  focusable through the wrapper so a keyboard reader gets the same tooltip. */}
              <TooltipTrigger asChild>
                <span className={`flex min-w-0 ${disabled ? 'cursor-not-allowed' : ''}`} tabIndex={!offered ? 0 : undefined}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-network={id}
                    disabled={disabled}
                    data-glow={selected ? '' : undefined}
                    onClick={() => setNetwork(id)}
                    className={segmentCls(selected, `px-2 text-[0.8125rem] ${offered ? '' : 'opacity-50'}`)}
                  >
                    <NetworkIcon network={id} className={`size-4 ${selected ? 'text-primary-foreground' : 'text-net'}`} />
                    <span className="text-center">{NETWORKS[id].name}</span>
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="max-w-64">
                {NETWORKS[id].blurb}
                {!offered && <span className="mt-1 block font-medium">Not offered by this faucet right now.</span>}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <p className="mt-3 text-sm leading-snug text-ink-muted" aria-live="polite">
        Coins go out on{' '}
        <TermPill term={networkTerm(network)} className="text-net">
          <NetworkIcon network={network} className="me-[0.25em] inline size-[0.95em] align-[-0.14em]" />
          {info.name}
        </TermPill>
        . Your wallet must be on{' '}
        {info.name} too, or the coins won&apos;t show up.
      </p>
      {unservedNames.length > 0 && (
        <p className="mt-1.5 text-xs text-ink-muted">
          {unservedNames.join(' and ')} {unservedNames.length === 1 ? "isn't" : "aren't"} offered by this faucet
          right now.
        </p>
      )}
    </fieldset>
  )
}
