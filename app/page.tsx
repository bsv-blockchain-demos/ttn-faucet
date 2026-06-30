import Image from 'next/image'
import { FaucetCard } from './components/FaucetCard'
import { StatsGrid } from './components/StatsGrid'
import { ApiTerminal } from './components/ApiTerminal'
import { ThemeToggle } from './components/ThemeProvider'
import { BoltIcon, TargetIcon, RefreshIcon } from './components/icons'

const GITHUB = 'https://github.com/bsv-blockchain-demos/ttn-faucet'
// NOTE: no public Teratestnet explorer URL is known yet — placeholder to confirm.
const EXPLORER = '#'
const DOCS = `${GITHUB}#readme`
const BSV = 'https://www.bsvblockchain.org'

const WRAP = 'mx-auto w-full max-w-[1000px] px-[clamp(20px,4vw,44px)]'

const HERO_STATS = [
  { v: '100,000', k: 'sats per claim' },
  { v: '~Instant', k: 'to spendable' },
  { v: 'BRC-100', k: 'one-click wallet' },
]

const PILLARS = [
  {
    Icon: BoltIcon,
    title: 'Parallel by design',
    body: 'The UTXO model lets transactions validate in parallel. Throw thousands of test txs at it and watch them settle without a mempool bottleneck.',
  },
  {
    Icon: TargetIcon,
    title: 'Instantly spendable',
    body: "Wallet claims hand back Atomic BEEF carrying the funded ancestors' proofs, no waiting for a block. Spend the coins the moment they land.",
  },
  {
    Icon: RefreshIcon,
    title: 'Production-grade SDKs',
    body: "Build with the same @bsv/sdk and wallet-toolbox you'll ship on mainnet. Test funds, real tooling, zero behavioural drift.",
  },
]

const WHY_SUB =
  "Teranode is BSV's modular, microservice node architecture, the thing that broke a million TPS. These coins let you load-test against it for free."

const navLink = 'text-sm font-medium text-muted-foreground transition hover:text-foreground'

export default function Home() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const payoutSats = Number(process.env.FAUCET_PAYOUT_SATS ?? 100000)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-hairline">
        <div className={`${WRAP} flex items-center justify-between py-[18px]`}>
          <div className="flex items-center gap-3">
            <Image
              src="/brand/bsv-mark.png"
              alt="BSV"
              width={40}
              height={40}
              className="rounded-input"
              style={{ boxShadow: 'var(--mark-shadow)' }}
            />
            <div className="leading-tight">
              <div className="font-display text-[15px] font-semibold text-foreground">BSV Teranode</div>
              <div className="text-xs text-muted-foreground">Testnet Faucet</div>
            </div>
          </div>
          <div className="flex items-center gap-[26px]">
            <nav className="hidden items-center gap-[26px] min-[880px]:flex">
              <a href="#api" className={navLink}>
                Dev API
              </a>
              <a href={EXPLORER} className={navLink}>
                Explorer
              </a>
              <a href={GITHUB} target="_blank" rel="noreferrer" className={navLink}>
                GitHub
              </a>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-hairline bg-band">
          <Image
            src="/brand/bsv-stacked-colour.png"
            alt=""
            aria-hidden
            width={300}
            height={300}
            className="pointer-events-none absolute -bottom-10 -right-5 w-[300px]"
            style={{ opacity: 0.05 }}
          />
          <div className={`${WRAP} relative pb-14 pt-[66px]`}>
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-pill bg-accent px-3.5 py-1.5 text-[12.5px] font-medium text-accent-foreground">
              <span
                className="dotpulse h-2 w-2 rounded-full"
                style={{ background: 'var(--cyan)', boxShadow: '0 0 10px var(--cyan)' }}
              />
              Teratestnet Online
            </div>
            <h1
              className="font-display text-[clamp(36px,5.6vw,58px)] font-semibold leading-[1.04] tracking-[-0.6px] text-foreground"
              style={{ maxWidth: '17ch' }}
            >
              Build on the network that broke a <span className="text-hl">million TPS</span>.
            </h1>
            <p
              className="mt-5 text-[clamp(16px,1.6vw,18px)] leading-relaxed text-muted-foreground"
              style={{ maxWidth: '58ch' }}
            >
              Request spendable Teratestnet coins in a single click and start shipping against Teranode.
              Connect a BRC-100 wallet and the funds land instantly, ready to spend, with no confirmations
              to wait on.
            </p>
            <div className="mt-8 flex max-w-[560px] flex-col gap-5 min-[620px]:flex-row min-[620px]:gap-0">
              {HERO_STATS.map((s) => (
                <div key={s.k} className="flex-1 border-t-2 border-input-border pt-3">
                  <div className="tnum font-display text-[30px] font-semibold text-foreground">{s.v}</div>
                  <div className="text-[13px] text-muted-foreground">{s.k}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Faucet card */}
        <section id="claim" className={`${WRAP} mt-12 pb-14`}>
          <FaucetCard siteKey={siteKey} payoutSats={payoutSats} />
        </section>

        {/* Stats */}
        <section className={`${WRAP} pb-14`}>
          <StatsGrid />
        </section>

        {/* Why */}
        <section className="border-y border-hairline bg-band">
          <div className={`${WRAP} py-14`}>
            <h2 className="font-display text-[clamp(26px,3.4vw,32px)] font-semibold leading-[1.1] text-foreground">
              Why builders fund on Teratestnet
            </h2>
            <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-muted-foreground">{WHY_SUB}</p>
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
            POST a Teratestnet address and the faucet builds, signs, and broadcasts through arcade,
            returning the transaction in extended format.
          </p>
          <ApiTerminal />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-hairline">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-4 py-[30px]`}>
          <div className="flex items-center gap-3">
            <Image src="/brand/bsv-mark.png" alt="BSV" width={32} height={32} className="rounded-[9px]" />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-foreground">BSV Teranode Testnet Faucet</div>
              <div className="text-xs text-muted-foreground">
                Built on @bsv/wallet-toolbox · for development &amp; testing only
              </div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-[22px] text-[13px] font-medium">
            <a href={DOCS} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              Docs
            </a>
            <a href={EXPLORER} className="text-muted-foreground hover:text-foreground">
              Explorer
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
