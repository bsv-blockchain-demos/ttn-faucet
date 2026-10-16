import Image from 'next/image'
import { FaucetCard } from './components/FaucetCard'
import { StatsGrid } from './components/StatsGrid'
import { ApiTerminal } from './components/ApiTerminal'
import { ThemeToggle } from './components/ThemeProvider'
import { NetworkProvider } from './components/NetworkProvider'
import { BoltIcon, TargetIcon, RefreshIcon } from './components/icons'

const GITHUB = 'https://github.com/bsv-blockchain-demos/ttn-faucet'
const DOCS = `${GITHUB}#readme`
const BSV = 'https://www.bsvblockchain.org'

const WRAP = 'mx-auto w-full max-w-[1080px] px-[clamp(16px,4vw,44px)]'

const PILLARS = [
  {
    Icon: TargetIcon,
    title: 'Instantly spendable',
    body: "Wallet claims hand back Atomic BEEF carrying the funded ancestors' proofs, so there's no waiting for a block. Spend the coins the moment they land.",
  },
  {
    Icon: RefreshIcon,
    title: 'Production-grade SDKs',
    body: "Build with the same @bsv/sdk and wallet-toolbox you'll ship on mainnet. Test funds, real tooling, zero behavioural drift.",
  },
  {
    Icon: BoltIcon,
    title: 'One faucet, every test network',
    body: 'Pick the network your wallet is on and the faucet pays out there. Your choice is remembered for next time.',
  },
]

const navLink = 'text-sm font-medium text-muted-foreground transition hover:text-foreground'

export default function Home() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const payoutSats = Number(process.env.FAUCET_PAYOUT_SATS ?? 100000)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-hairline">
        <div className={`${WRAP} flex items-center justify-between py-3 min-[620px]:py-[14px]`}>
          <div className="flex items-center gap-3">
            <Image
              src="/brand/bsv-mark.png"
              alt="BSV"
              width={36}
              height={36}
              className="rounded-input"
              style={{ boxShadow: 'var(--mark-shadow)' }}
            />
            <div className="leading-tight">
              <div className="font-display text-[15px] font-semibold text-foreground">BSV Faucet</div>
              <div className="text-xs text-muted-foreground">Free test coins</div>
            </div>
          </div>
          <div className="flex items-center gap-[26px]">
            <nav className="hidden items-center gap-[26px] min-[880px]:flex">
              <a href="#api" className={navLink}>
                Dev API
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
          {/* Claim: the card is the hero. On phones the headline shrinks to one line so the claim
              button sits above the fold; on wide screens copy and card sit side by side. */}
          <section id="claim" className="relative overflow-hidden border-b border-hairline bg-band">
            <Image
              src="/brand/bsv-stacked-colour.png"
              alt=""
              aria-hidden
              width={300}
              height={300}
              className="pointer-events-none absolute -bottom-10 -left-10 hidden w-[300px] min-[880px]:block"
              style={{ opacity: 0.05 }}
            />
            <div
              className={`${WRAP} relative grid grid-cols-1 items-center gap-4 py-4 min-[620px]:gap-8 min-[620px]:py-10 min-[880px]:grid-cols-[1fr_440px] min-[880px]:gap-12 min-[880px]:py-14`}
            >
              <div>
                <h1 className="font-display text-[clamp(24px,4.6vw,48px)] font-semibold leading-[1.08] tracking-[-0.4px] text-foreground">
                  Free test coins, <span className="text-hl">one click</span>.
                </h1>
                <p className="mt-2 hidden max-w-[48ch] text-[clamp(15px,1.5vw,17px)] leading-relaxed text-muted-foreground min-[620px]:block min-[620px]:mt-4">
                  Pick your network, connect a BRC-100 wallet, and the coins land ready to spend, with no
                  confirmations to wait on. No wallet? Paste an address instead.
                </p>
                <ul className="mt-6 hidden flex-col gap-2.5 text-[14px] text-muted-foreground min-[880px]:flex">
                  {[
                    `${payoutSats.toLocaleString()} sats per claim`,
                    'Spendable the moment they land',
                    'One click with any BRC-100 wallet',
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <FaucetCard siteKey={siteKey} payoutSats={payoutSats} />
            </div>
          </section>

          {/* Stats */}
          <section className={`${WRAP} py-14`}>
            <StatsGrid payoutSats={payoutSats} />
          </section>

          {/* Why */}
          <section className="border-y border-hairline bg-band">
            <div className={`${WRAP} py-14`}>
              <h2 className="font-display text-[clamp(26px,3.4vw,32px)] font-semibold leading-[1.1] text-foreground">
                Built for builders
              </h2>
              <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-muted-foreground">
                Test against real infrastructure with real tooling, without spending real coins.
              </p>
              <div className="mt-[30px] grid grid-cols-1 gap-5 min-[620px]:grid-cols-2 min-[880px]:grid-cols-3">
                {PILLARS.map(({ Icon, title, body }) => (
                  <div key={title} className="lift rounded-card border border-hairline bg-card p-[26px]">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[13px] bg-accent text-accent-foreground">
                      <Icon size={22} />
                    </div>
                    <div className="mb-2 font-display text-lg font-semibold text-foreground">{title}</div>
                    <div className="text-sm leading-relaxed text-muted-foreground">{body}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* API */}
          <section id="api" className={`${WRAP} scroll-mt-6 py-14`}>
            <div className="mb-4 inline-flex items-center rounded-pill bg-accent px-3 py-[5px] text-[11px] font-medium text-accent-foreground">
              For scripts &amp; CI
            </div>
            <h2 className="font-display text-[clamp(26px,3.4vw,32px)] font-semibold leading-[1.1] text-foreground">
              Or just hit the API
            </h2>
            <p className="mb-[22px] mt-2 max-w-[60ch] text-base leading-relaxed text-muted-foreground">
              POST an address and a network, and the faucet builds, signs, and broadcasts the payout,
              returning the transaction in extended format.
            </p>
            <ApiTerminal />
          </section>
        </main>
      </NetworkProvider>

      {/* Footer */}
      <footer className="border-t border-hairline">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-4 py-[30px]`}>
          <div className="flex items-center gap-3">
            <Image src="/brand/bsv-mark.png" alt="BSV" width={32} height={32} className="rounded-[9px]" />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-foreground">BSV Faucet</div>
              <div className="text-xs text-muted-foreground">
                Built on @bsv/wallet-toolbox · for development &amp; testing only
              </div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-[22px] text-[13px] font-medium">
            <a href={DOCS} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              Docs
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              GitHub
            </a>
            <a href={BSV} target="_blank" rel="noreferrer" className="text-link">
              BSV Blockchain
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
