import { FaucetCard } from './components/FaucetCard'
import { StatsGrid } from './components/StatsGrid'
import { ApiTerminal } from './components/ApiTerminal'
import { ThemeToggle } from './components/ThemeProvider'
import { NetworkProvider } from './components/NetworkProvider'
import { NetworkPanel } from './components/NetworkPanel'
import { BrandMark } from './components/BrandMark'
import { NETWORK_IDS } from '@/lib/networks'
import { siteUrl } from '@/lib/base-path'
import { getPublicConfig } from '@/lib/public-config'

const GITHUB = 'https://github.com/bsv-blockchain-demos/ttn-faucet'
const DOCS = `${GITHUB}#readme`
const BSV = 'https://www.bsvblockchain.org'

const WRAP = 'mx-auto w-full max-w-[1200px] px-[clamp(16px,4vw,40px)]'

const PRINCIPLES = [
  {
    title: 'Spendable on receipt',
    body: "Wallet claims hand back Atomic BEEF carrying the funded ancestors' proofs. No block to wait for: spend the coins the moment they land.",
    panel: 'bg-card',
  },
  {
    title: 'Production tooling',
    body: "Built on the same @bsv/sdk and wallet-toolbox you'll ship on mainnet. Test funds, real tooling, no behavioural drift.",
    panel: 'on-ink',
  },
  {
    title: 'Every test network',
    body: 'Pick the network your wallet is on and the faucet pays out there. The choice is remembered for next time.',
    panel: 'on-net',
  },
]

const navLink = 'text-[14px] font-medium text-foreground/80 transition-colors hover:text-foreground'

/** Big section heading: mono index above an oversized title. */
function SectionHead({ index, title, sub }: { index: string; title: string; sub?: string }) {
  return (
    <div className="mb-8 min-[880px]:mb-12">
      <div className="label mb-3">{index}</div>
      <h2 className="max-w-[18ch] font-display text-[clamp(32px,5vw,64px)] font-semibold leading-[0.98] tracking-[-0.04em] text-foreground">
        {title}
      </h2>
      {sub && <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default async function Home() {
  // Rendered per request, so one image serves each deployment's own URL and Turnstile key.
  const config = await getPublicConfig()
  // '' tells the claim forms Turnstile is off: no widget, no token.
  const siteKey = config.turnstileRequired ? config.turnstileSiteKey : ''
  const payoutSats = Number(process.env.FAUCET_PAYOUT_SATS ?? 100000)

  const spec = [
    ['Payout', `${payoutSats.toLocaleString()} sat`],
    ['Settlement', 'Instant'],
    ['Networks', `${NETWORK_IDS.length} test networks`],
    ['Wallets', 'Any BRC-100'],
  ]

  return (
    <NetworkProvider>
      <div className="flex min-h-screen flex-col">
        {/* Header + hero share one network-coloured field: the network is the biggest thing on screen. */}
        <NetworkPanel className="on-net transition-colors">
          <header className={`${WRAP} flex h-16 items-center justify-between`}>
            <div className="flex items-center gap-4">
              <BrandMark className="h-3 min-[480px]:h-[15px]" />
              <span className="h-5 w-px bg-current opacity-40" aria-hidden />
              <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Faucet</span>
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
          </header>

          {/* Claim. On phones the headline is one line so the claim button sits above the fold. */}
          <section
            id="claim"
            className={`${WRAP} pb-6 pt-2 min-[620px]:pb-16 min-[620px]:pt-10 min-[1000px]:pb-24 min-[1000px]:pt-16`}
          >
            <div className="grid grid-cols-1 items-end gap-5 min-[620px]:gap-10 min-[1000px]:grid-cols-12">
              <div className="min-[1000px]:col-span-7">
                <div className="label mb-5 hidden min-[620px]:block">BSV Blockchain · Test coin faucet</div>
                <h1 className="font-display text-[clamp(34px,8.4vw,112px)] font-semibold leading-[0.9] tracking-[-0.05em]">
                  Test coins,
                  <br className="hidden min-[620px]:block" /> on demand.
                </h1>
                <p className="mt-6 hidden max-w-[40ch] text-[18px] leading-relaxed text-muted-foreground min-[620px]:block">
                  Choose the network your wallet is on and claim in one step. Coins arrive ready to spend,
                  with no confirmations to wait on.
                </p>

                {/* Spec blocks */}
                <dl className="mt-10 hidden grid-cols-4 gap-2 min-[1000px]:grid">
                  {spec.map(([k, v]) => (
                    <div key={k} className="panel-sub rounded-panel p-4">
                      <dt className="label mb-6">{k}</dt>
                      <dd className="tnum text-[15px] font-semibold leading-tight">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="min-[1000px]:col-span-5">
                <FaucetCard siteKey={siteKey} payoutSats={payoutSats} />
              </div>
            </div>
          </section>
        </NetworkPanel>

        <main className="flex-1">
          {/* Status */}
          <section className={`${WRAP} py-16 min-[880px]:py-24`}>
            <SectionHead index="02 — Status" title="Faucet readout" />
            <StatsGrid payoutSats={payoutSats} />
          </section>

          {/* Principles */}
          <section className={`${WRAP} pb-16 min-[880px]:pb-24`}>
            <SectionHead
              index="03 — Principles"
              title="Built for builders"
              sub="Test against real infrastructure with real tooling, without spending real coins."
            />
            <div className="grid grid-cols-1 gap-2 min-[880px]:grid-cols-3">
              {PRINCIPLES.map(({ title, body, panel }, i) => (
                <NetworkPanel
                  key={title}
                  className={`${panel} flex min-h-[280px] flex-col justify-between gap-10 rounded-card p-7 transition-colors`}
                >
                  <div className="tnum font-display text-[64px] font-semibold leading-none tracking-[-0.05em] text-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <div className="mb-2 text-[20px] font-semibold tracking-[-0.02em] text-foreground">{title}</div>
                    <div className="text-[15px] leading-relaxed text-muted-foreground">{body}</div>
                  </div>
                </NetworkPanel>
              ))}
            </div>
          </section>

          {/* API: a full-bleed ink field. */}
          <section id="api" className="on-ink">
            <div className={`${WRAP} py-16 min-[880px]:py-24`}>
              <SectionHead
                index="04 — API"
                title="Or call it from a script"
                sub="POST an address and a network. The faucet builds, signs and broadcasts the payout, and returns the transaction in extended format."
              />
              <ApiTerminal claimUrl={siteUrl('/api/claim', config.siteUrl)} />
            </div>
          </section>
        </main>

        <footer className="on-ink border-t border-hairline">
          <div className={`${WRAP} flex flex-wrap items-center justify-between gap-4 py-6`}>
            <div className="label">BSV Faucet · Development &amp; testing only · Built on @bsv/wallet-toolbox</div>
            <nav className="flex flex-wrap gap-6">
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
    </NetworkProvider>
  )
}
