import { FaucetCard } from './components/FaucetCard'
import { StatsGrid } from './components/StatsGrid'
import { ApiTerminal } from './components/ApiTerminal'

const GITHUB = 'https://github.com/bsv-blockchain-demos/ttn-faucet'
// NOTE: no public teratestnet explorer URL is known yet — these are placeholders to confirm.
const EXPLORER = '#'
const DOCS = `${GITHUB}#readme`
const BSV = 'https://www.bsvblockchain.org'

const FEATURES = [
  {
    n: '01',
    title: 'Parallel by design',
    body: 'The UTXO model lets transactions validate in parallel. Throw thousands of test txs at it and watch them settle without a mempool bottleneck.',
  },
  {
    n: '02',
    title: 'Instantly spendable',
    body: "Wallet claims hand back Atomic BEEF carrying the funded ancestors' proofs — no waiting for a block. Spend the coins the moment they land.",
  },
  {
    n: '03',
    title: 'Production-grade SDKs',
    body: "Build with the same @bsv/sdk and wallet-toolbox you'll ship on mainnet. Test funds, real tooling, zero behavioural drift.",
  },
]

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-bold text-white shadow-[0_4px_16px_rgba(79,107,255,0.5)]">
        B
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">BSV Teranode</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-white/40">Testnet Faucet</span>
      </span>
    </span>
  )
}

export default function Home() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const payoutSats = Number(process.env.FAUCET_PAYOUT_SATS ?? 100000)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-background/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3.5">
          <Logo />
          <nav className="flex items-center gap-1 text-sm text-white/60 sm:gap-2">
            <a href="#api" className="rounded-lg px-3 py-1.5 transition hover:text-white">
              Dev API
            </a>
            <a href={EXPLORER} className="rounded-lg px-3 py-1.5 transition hover:text-white">
              Explorer
            </a>
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white transition hover:bg-white/10"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4">
        {/* Hero */}
        <section className="pt-10 sm:pt-14">
          <FaucetCard siteKey={siteKey} payoutSats={payoutSats} />

          <div className="mt-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400 shadow-[0_0_8px_var(--color-accent-400)]" />
              NETWORK ONLINE · teratestnet
            </span>

            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
              Free test coins to build on the <span className="text-brand-400">million-TPS</span> network.
            </h1>

            <p className="mt-5 max-w-xl text-white/55">
              Grab spendable teratestnet satoshis in one click and start shipping against Teranode — the
              architecture that pushed BSV past 1,000,000 transactions per second. No signup, no waiting
              for confirmations.
            </p>

            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
              {[
                { v: '100,000', k: 'sats per claim' },
                { v: '~0s', k: 'to spendable' },
                { v: 'BRC-100', k: 'one-click wallet' },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-2xl font-bold text-white">{s.v}</dt>
                  <dd className="text-xs text-white/45">{s.k}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Stats grid */}
        <section className="mt-14">
          <StatsGrid />
        </section>

        {/* Why */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Why bother with teratestnet coins?
          </h2>
          <p className="mt-3 max-w-xl text-white/55">
            Teranode is BSV&apos;s modular, microservice node architecture — the thing that broke a million
            TPS. These coins let you load-test against it for free.
          </p>

          <div className="mt-8 flex flex-col gap-4">
            {FEATURES.map((f) => (
              <div key={f.n} className="rounded-2xl border border-white/10 bg-surface p-6">
                <div className="font-mono text-lg font-bold text-brand-400">{f.n}</div>
                <h3 className="mt-2 font-semibold text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* API */}
        <section id="api" className="mt-20 scroll-mt-20">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs uppercase tracking-wide text-white/50">
            For scripts &amp; CI
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">Or just hit the API.</h2>
          <p className="mt-3 mb-7 max-w-xl text-white/55">
            POST a teratestnet address and the faucet builds, signs, and broadcasts through arcade —
            returning the transaction in extended format.
          </p>
          <ApiTerminal />
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-white/10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">BSV Teranode Testnet Faucet</div>
            <div className="text-xs text-white/40">
              Built on @bsv/wallet-toolbox · for development &amp; testing only
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/50">
            <a href={DOCS} target="_blank" rel="noreferrer" className="hover:text-white">
              Docs
            </a>
            <a href={EXPLORER} className="hover:text-white">
              Explorer
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-white">
              GitHub
            </a>
            <a href={BSV} target="_blank" rel="noreferrer" className="hover:text-white">
              BSV Blockchain
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
