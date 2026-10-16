import Image from 'next/image'
import { FaucetCard } from './components/FaucetCard'
import { StatsGrid } from './components/StatsGrid'
import { ApiTerminal } from './components/ApiTerminal'
import { ThemeToggle } from './components/ThemeProvider'
import { NetworkProvider } from './components/NetworkProvider'
import { NETWORK_IDS, NETWORKS } from '@/lib/networks'

const GITHUB = 'https://github.com/bsv-blockchain-demos/ttn-faucet'
const DOCS = `${GITHUB}#readme`
const BSV = 'https://www.bsvblockchain.org'

const WRAP = 'mx-auto w-full max-w-[1120px] px-[clamp(16px,4vw,40px)]'

const PRINCIPLES = [
  {
    title: 'Spendable on receipt',
    body: "Wallet claims hand back Atomic BEEF carrying the funded ancestors' proofs. No block to wait for: spend the coins the moment they land.",
  },
  {
    title: 'Production tooling',
    body: "Built on the same @bsv/sdk and wallet-toolbox you'll ship on mainnet. Test funds, real tooling, no behavioural drift.",
  },
  {
    title: 'Every test network',
    body: 'Pick the network your wallet is on and the faucet pays out there. The choice is remembered for next time.',
  },
]

const navLink = 'text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground'

/** A numbered section head: full-strength rule, mono index, title. */
function SectionHead({ index, title, sub }: { index: string; title: string; sub?: string }) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-3 border-t border-rule pt-4 min-[1000px]:grid-cols-[200px_1fr] min-[1000px]:gap-8">
      <div className="label">{index}</div>
      <div>
        <h2 className="font-display text-[clamp(22px,2.6vw,28px)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        {sub && <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

export default function Home() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const payoutSats = Number(process.env.FAUCET_PAYOUT_SATS ?? 100000)

  const spec = [
    ['Payout', `${payoutSats.toLocaleString()} sat`],
    ['Settlement', 'Instant · Atomic BEEF'],
    ['Networks', NETWORK_IDS.map((id) => NETWORKS[id].name).join(' · ')],
    ['Wallets', 'Any BRC-100'],
  ]

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-hairline">
        <div className={`${WRAP} flex h-14 items-center justify-between`}>
          <div className="flex items-center gap-3">
            <Image src="/brand/bsv-mark.png" alt="BSV" width={28} height={28} className="rounded-[4px]" />
            <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              BSV Faucet
            </span>
            <span className="label hidden min-[480px]:inline">Test networks</span>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-6 min-[620px]:flex">
              <a href="#api" className={navLink}>
                API
              </a>
              <a href={DOCS} target="_blank" rel="noreferrer" className={navLink}>
                Docs
              </a>
              <a href={GITHUB} target="_blank" rel="noreferrer" className={navLink}>
                GitHub
              </a>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <NetworkProvider>
        <main className="flex-1">
          {/* Claim. The card is the focal point: on phones the headline is one line so the claim
              button sits above the fold; from 880px copy and card share a 12-column grid. */}
          <section id="claim" className={`${WRAP} pb-12 pt-5 min-[620px]:pt-12 min-[880px]:pb-20 min-[880px]:pt-16`}>
            <div className="grid grid-cols-1 gap-5 min-[620px]:gap-10 min-[880px]:grid-cols-12 min-[880px]:gap-8">
              <div className="min-[880px]:col-span-6 min-[880px]:pt-2">
                <div className="label mb-4 hidden min-[620px]:block">01 — Claim</div>
                <h1 className="font-display text-[clamp(28px,5vw,56px)] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground">
                  Test coins,
                  <br className="hidden min-[620px]:block" /> on demand.
                </h1>
                <p className="mt-5 hidden max-w-[44ch] text-[16px] leading-relaxed text-muted-foreground min-[620px]:block">
                  Choose the network your wallet is on and claim in one step. Coins arrive ready to spend,
                  with no confirmations to wait on.
                </p>

                {/* Spec sheet */}
                <dl className="mt-10 hidden border-t border-hairline min-[880px]:block">
                  {spec.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[120px_1fr] items-baseline border-b border-hairline py-3">
                      <dt className="label">{k}</dt>
                      <dd className="tnum text-[14px] text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="min-[880px]:col-span-6 min-[1000px]:col-span-5 min-[1000px]:col-start-8">
                <FaucetCard siteKey={siteKey} payoutSats={payoutSats} />
              </div>
            </div>
          </section>

          {/* Status */}
          <section className={`${WRAP} pb-20`}>
            <SectionHead index="02 — Status" title="Faucet readout" />
            <StatsGrid payoutSats={payoutSats} />
          </section>

          {/* Principles */}
          <section className={`${WRAP} pb-20`}>
            <SectionHead
              index="03 — Principles"
              title="Built for builders"
              sub="Test against real infrastructure with real tooling, without spending real coins."
            />
            <div className="grid grid-cols-1 gap-8 min-[620px]:grid-cols-3 min-[1000px]:ml-[232px]">
              {PRINCIPLES.map(({ title, body }, i) => (
                <div key={title} className="border-t border-hairline pt-4">
                  <div className="label mb-3 tnum">{String(i + 1).padStart(2, '0')}</div>
                  <div className="mb-2 text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</div>
                  <div className="text-[14px] leading-relaxed text-muted-foreground">{body}</div>
                </div>
              ))}
            </div>
          </section>

          {/* API */}
          <section id="api" className={`${WRAP} scroll-mt-6 pb-24`}>
            <SectionHead
              index="04 — API"
              title="Or call it from a script"
              sub="POST an address and a network. The faucet builds, signs and broadcasts the payout, and returns the transaction in extended format."
            />
            <div className="min-[1000px]:ml-[232px]">
              <ApiTerminal />
            </div>
          </section>
        </main>
      </NetworkProvider>

      {/* Footer */}
      <footer className="border-t border-hairline">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-4 py-6`}>
          <div className="label">BSV Faucet · Development &amp; testing only · Built on @bsv/wallet-toolbox</div>
          <nav className="flex flex-wrap gap-6 text-[13px] font-medium">
            <a href={DOCS} target="_blank" rel="noreferrer" className={navLink}>
              Docs
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className={navLink}>
              GitHub
            </a>
            <a href={BSV} target="_blank" rel="noreferrer" className={navLink}>
              BSV Blockchain
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
