import { FaucetCard } from './components/FaucetCard'
import { StatsGrid } from './components/StatsGrid'
import { ApiTerminal } from './components/ApiTerminal'
import { NetworkProvider } from './components/NetworkProvider'
import { SiteHeader } from './components/SiteHeader'
import { SiteFooter } from './components/SiteFooter'
import { SpecStrip } from './components/SpecStrip'
import { TermPill } from './components/TermPill'
import { TERMS } from '@/lib/glossary'
import { NETWORK_IDS } from '@/lib/networks'
import { siteUrl } from '@/lib/base-path'
import { resolvePublicConfig } from '@/lib/public-config'
import { connection } from 'next/server'

/** The phrase a skimming reader should catch, lifted out of the muted body copy. */
function Em({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>
}

const PRINCIPLES = [
  {
    title: 'Spendable on receipt',
    body: (
      <>
        Wallet claims hand back <TermPill term={TERMS.atomicBeef}>Atomic BEEF</TermPill> carrying the funded
        ancestors&apos; proofs. No block to wait
        for: <Em>spend the coins the moment they land</Em>.
      </>
    ),
  },
  {
    title: 'Production tooling',
    body: (
      <>
        Built on the same <TermPill term={TERMS.bsvSdk}>@bsv/sdk</TermPill> and{' '}
        <TermPill term={TERMS.walletToolbox}>wallet-toolbox</TermPill> you&apos;ll ship on mainnet. Test funds, real tooling,{' '}
        <Em>no behavioural drift</Em>.
      </>
    ),
  },
  {
    title: 'Every test network',
    body: (
      <>
        Pick the network your wallet is on and <Em>the faucet pays out there</Em>. The choice is{' '}
        <Em>remembered for next time</Em>.
      </>
    ),
  },
]

/** Small uppercase kicker above a section title (bsvblockchain.org's Eyebrow). */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="label-sm mb-3 text-primary uppercase">{children}</p>
}

/** bsvblockchain.org's SectionHeader: eyebrow, headline-lg title, body-lg lede. */
function SectionHeader({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <header className="mb-10 max-w-2xl md:mb-14">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="headline-lg">{title}</h2>
      {lede && <p className="body-lg mt-4 text-ink-muted">{lede}</p>}
    </header>
  )
}

export default async function Home() {
  // Rendered per request, so one image serves each deployment's own URL and Turnstile key.
  await connection()
  const config = resolvePublicConfig(process.env)
  const siteKey = config.turnstileSiteKey
  const payoutSats = Number(process.env.FAUCET_PAYOUT_SATS ?? 100000)

  return (
    <NetworkProvider>
      <SiteHeader />

      <main id="main" className="flex-1">
        {/* Hero: text column and the claim card, over the site's blue wash. */}
        <section id="claim" className="relative scroll-mt-16 pt-10 pb-12 md:pt-16 md:pb-20">
          <div aria-hidden className="hero-glow pointer-events-none absolute -top-16 right-0 select-none" />

          <div className="relative z-10 container-page">
            <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
              <div className="max-w-3xl lg:pt-6">
                <p className="label-sm text-primary uppercase">Test coin faucet</p>
                <h1 className="mt-4 display-lg">Test coins, on demand.</h1>
                <p className="body-lg mt-6 max-w-2xl text-ink-muted">
                  Choose the network your wallet is on and claim in one step. Coins arrive ready to spend, with no
                  confirmations to wait on.
                </p>

                <SpecStrip payoutSats={payoutSats} networkCount={NETWORK_IDS.length} />
              </div>

              <FaucetCard siteKey={siteKey} payoutSats={payoutSats} />
            </div>
          </div>
        </section>

        {/* Status */}
        <section id="status" className="section-y scroll-mt-16">
          <div className="container-page">
            <SectionHeader eyebrow="Status" title="Faucet readout" />
            <StatsGrid payoutSats={payoutSats} />
          </div>
        </section>

        {/* Principles */}
        <section className="section-y bg-surface">
          <div className="container-page">
            <SectionHeader
              eyebrow="Principles"
              title="Built for builders"
              lede="Test against real infrastructure with real tooling, without spending real coins."
            />
            <div className="grid gap-4 md:grid-cols-3">
              {PRINCIPLES.map(({ title, body }, i) => (
                <div
                  key={title}
                  data-glow=""
                  className="card-surface flex flex-col rounded-lg border border-border bg-surface-raised p-6"
                >
                  <p className="label-sm tnum mb-3 text-primary uppercase">{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="headline-sm">{title}</h3>
                  <p className="body-md mt-2 text-ink-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* API: a page-tone section with only the terminal dark, as bsvblockchain.org frames its quickstarts. */}
        <section id="api" className="section-y relative scroll-mt-16 overflow-hidden">
          <div aria-hidden className="hero-glow glow-api pointer-events-none absolute inset-0 select-none" />
          <div className="relative z-10 container-page">
            <SectionHeader
              eyebrow="API"
              title="Or call it from a script"
              lede="POST an address and a network. The faucet builds, signs and broadcasts the payout, and returns the transaction in extended format."
            />
            <ApiTerminal claimUrl={siteUrl('/api/claim', config.siteUrl)} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </NetworkProvider>
  )
}
