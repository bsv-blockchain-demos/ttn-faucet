'use client'
import { useEffect, useState } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { NetworkIcon } from './NetworkIcon'
import { NETWORK_IDS, NETWORKS } from '@/lib/networks'

/** WhatsOnChain's mainnet BSV/USD rate. Public and CORS-open, so the browser asks it directly. */
const RATE_URL = 'https://api.whatsonchain.com/v1/bsv/main/exchangerate'
const BRC100_URL = 'https://www.beersy.dev/brc/100'

/** undefined = loading, null = unavailable, number = USD per BSV. */
function useUsdRate(): number | null | undefined {
  const [rate, setRate] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    fetch(RATE_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => alive && setRate(typeof json?.rate === 'number' ? json.rate : null))
      .catch(() => alive && setRate(null))
    return () => {
      alive = false
    }
  }, [])
  return rate
}

/** A sub-cent amount still reads as money: two significant figures, e.g. $0.017. */
const usd = (n: number) =>
  n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    ...(n < 1 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 }),
  })

// A value that has a tooltip: dotted underline, so it reads as "there's more here".
const HINT = 'cursor-help underline decoration-ink-muted/50 decoration-dotted underline-offset-4'

/**
 * The hero's four facts. Payout shows what the same amount would be worth on mainnet, with the
 * reminder that test coins are worth nothing; Wallets links to the BRC-100 spec.
 */
export function SpecStrip({ payoutSats, networkCount }: { payoutSats: number; networkCount: number }) {
  const rate = useUsdRate()
  const mainnetValue =
    rate === undefined
      ? 'Checking the BSV price…'
      : rate === null
      ? "Mainnet value unavailable right now."
      : `${usd((payoutSats / 1e8) * rate)} if this were mainnet BSV (WhatsOnChain rate).`

  return (
    <dl className="mt-10 hidden gap-px overflow-hidden rounded-lg bg-border sm:grid sm:grid-cols-4">
      <Fact label="Payout">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className={HINT}>
              {payoutSats.toLocaleString()} sat
            </span>
          </TooltipTrigger>
          <TooltipContent sideOffset={6} className="max-w-60 text-center">
            {mainnetValue}
            <span className="mt-0.5 block font-medium">Testnet coins have no value.</span>
          </TooltipContent>
        </Tooltip>
      </Fact>
      <Fact label="Settlement">Instant</Fact>
      <Fact label="Networks">
        <NetworksFact networkCount={networkCount} />
      </Fact>
      <Fact label="Wallets">
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={BRC100_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground underline decoration-ink-muted/50 decoration-dotted underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
            >
              Any Bitcoin Web3 Native wallet
            </a>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>
            <span className="inline-flex items-center gap-1">
              BRC-100
              <ArrowUpRight aria-hidden className="size-3" />
            </span>
          </TooltipContent>
        </Tooltip>
      </Fact>
    </dl>
  )
}

/** How long each network stays lit: enough to read its ~15-word sentence before the next one. */
const CYCLE_MS = 4000

/**
 * "3 test networks", with a facepile tooltip that walks through them: while it's open, one circle
 * lights up at a time and the line below says what that network is. The cycle only runs while the
 * tooltip is open, pauses while the pointer rests on the tooltip (someone is reading it), and
 * restarts from the first network each time it opens.
 */
function NetworksFact({ networkCount }: { networkCount: number }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!open || paused) return
    const id = setInterval(() => setActive((i) => (i + 1) % NETWORK_IDS.length), CYCLE_MS)
    return () => clearInterval(id)
  }, [open, paused])

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setActive(0)
          setPaused(false)
        }
      }}
    >
      <TooltipTrigger asChild>
        <span tabIndex={0} className={HINT}>
          {networkCount} test networks
        </span>
      </TooltipTrigger>
      <TooltipContent
        sideOffset={6}
        className="w-64 px-3.5 py-3"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <NetworkFacepile active={active} />
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Every test network as an overlapping row of coloured circles, each with its icon. The lit one is
 * full strength, lifted and drawn on top; the rest dim back. Below it, the lit network's name and
 * its one-line description, at a fixed height so the tooltip doesn't jump as the text changes.
 * The ring is the tooltip's own colour (bg-foreground), so overlaps read as cut-outs.
 */
function NetworkFacepile({ active }: { active: number }) {
  const lit = NETWORKS[NETWORK_IDS[active]]
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <div className="flex -space-x-2">
        {NETWORK_IDS.map((id, i) => (
          <span
            key={id}
            data-network={id}
            className={`relative flex size-8 items-center justify-center rounded-full bg-net text-background ring-2 ring-foreground transition-[opacity,transform] duration-300 ${
              i === active ? 'z-10 scale-110 opacity-100' : 'scale-95 opacity-40'
            }`}
          >
            <NetworkIcon network={id} className="size-4" />
          </span>
        ))}
      </div>
      <div className="min-h-[3.25lh]" aria-live="polite">
        <span className="block font-medium">{lit.name}</span>
        <span className="mt-0.5 block opacity-80">{lit.blurb}</span>
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-raised p-4 md:p-5">
      <dt className="label-sm text-ink-muted uppercase">{label}</dt>
      <dd className="tnum mt-2 text-sm leading-snug font-medium text-balance text-foreground">{children}</dd>
    </div>
  )
}
