'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '../components/ThemeProvider'
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ExternalIcon,
  WarningIcon,
} from '../components/icons'

// ---------------------------------------------------------------------------
// Component States Gallery — a DESIGN AID, not part of the product.
// Faithful static reproductions (same token utilities as the live components)
// of every faucet state with mock data — no wallet, no Turnstile, no backend.
// Flip the theme toggle (top-right) to review every state in light AND dark.
// Safe to delete (app/states/) after the overhaul. Not linked from the app.
// ---------------------------------------------------------------------------

const PAYOUT = 100_000
const fmt = (n: number) => n.toLocaleString()
const MOCK_ADDR = 'n2ZfV8a9MockTeratestnetAddrExampleXyz'
const MOCK_WIF = 'cR4MockWIFneverUseForRealFundsExample9aBcDeFgHiJkLmN'
const MOCK_EF = '0200beef01fe4d6f636b4546486578a1b2c3d4e5f60718293a4b5c6d7e8f90feb0c0ad00000000'

type StepState = 'done' | 'active' | 'todo' | 'error'
type Phase = 'detecting' | 'unavailable' | 'idle' | 'idlewarn' | 'claiming' | 'success' | 'error'
const STEP_LABELS = ['Detect', 'Authorize', 'Fund', 'Spendable'] as const
const STEP_MAP: Record<Phase, StepState[]> = {
  detecting: ['active', 'todo', 'todo', 'todo'],
  unavailable: ['error', 'todo', 'todo', 'todo'],
  idle: ['done', 'active', 'todo', 'todo'],
  idlewarn: ['done', 'active', 'todo', 'todo'],
  claiming: ['done', 'done', 'active', 'todo'],
  success: ['done', 'done', 'done', 'done'],
  error: ['done', 'done', 'error', 'todo'],
}

const PRIMARY_CTA =
  'shine flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-semibold text-primary-foreground shadow-primary disabled:cursor-not-allowed disabled:opacity-60'
const SECONDARY_CTA =
  'inline-flex h-11 w-full items-center justify-center rounded-pill border-[1.5px] border-[color:var(--btn2-bd)] bg-transparent px-[22px] text-sm font-semibold text-[color:var(--btn2-fg)] min-[620px]:w-auto'

function StepCircle({ state, n }: { state: StepState; n: number }) {
  const base =
    'flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] text-xs font-semibold'
  if (state === 'done')
    return <span className={`${base} border-primary bg-primary text-primary-foreground`}><CheckIcon size={13} /></span>
  if (state === 'active') return <span className={`${base} border-primary bg-accent text-accent-foreground`}>{n}</span>
  if (state === 'error') return <span className={`${base} border-neg bg-neg-bg text-neg`}>!</span>
  return <span className={`${base} border-hairline bg-transparent text-muted-foreground`}>{n}</span>
}

function Stepper({ phase }: { phase: Phase }) {
  const states = STEP_MAP[phase]
  return (
    <div className="relative mb-[22px] flex justify-between px-2">
      <div className="absolute left-10 right-10 top-[15px] h-0.5 bg-hairline" />
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="relative z-[1] flex flex-1 flex-col items-center gap-2">
          <StepCircle state={states[i]} n={i + 1} />
          <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  )
}

function Captcha() {
  return (
    <div className="flex min-h-[78px] items-center justify-center rounded-input border border-dashed border-input-border p-3 text-xs text-muted-foreground">
      Cloudflare Turnstile
    </div>
  )
}

const WALLETS = [
  { name: 'BSV Browser', m: 'B' },
  { name: 'BSV Desktop', m: 'D' },
  { name: 'Metanet', m: 'M' },
]

function CardShell({ tab, children }: { tab: 'wallet' | 'address'; children: React.ReactNode }) {
  const tabCls = (active: boolean) =>
    `h-[42px] flex-1 rounded-pill text-sm font-semibold ${
      active ? 'bg-primary text-primary-foreground shadow-card' : 'text-muted-foreground'
    }`
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-hairline px-6 py-5">
        <div className="leading-tight">
          <div className="font-display text-[17px] font-semibold text-foreground">Teratestnet Coins</div>
          <div className="text-[12.5px] text-muted-foreground">{fmt(PAYOUT)} sats per request</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent px-3 py-[5px] text-xs font-medium text-accent-foreground">
          <span className="h-[7px] w-[7px] rounded-full bg-pos" />
          Live
        </span>
      </div>
      <div className="px-6 pt-5">
        <div className="flex gap-[7px] rounded-pill bg-muted p-[5px]">
          <span className={tabCls(tab === 'wallet')}>Wallet · 1-click</span>
          <span className={tabCls(tab === 'address')}>Paste address</span>
        </div>
      </div>
      <div className="px-6 pb-6 pt-[22px]">
        {tab === 'wallet' && (
          <div className="mb-[22px] grid grid-cols-3 gap-[11px]">
            {WALLETS.map((w) => (
              <div key={w.name} className="rounded-[13px] border border-hairline bg-band px-2.5 py-[15px] text-center">
                <span className="mx-auto mb-[9px] flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent font-display text-[15px] font-semibold text-accent-foreground">
                  {w.m}
                </span>
                <span className="text-[12.5px] font-medium text-foreground">{w.name}</span>
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function WalletExplainer() {
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      Connect a BRC-100 wallet and we&apos;ll pay a BRC-29 output straight to your identity key,
      internalized as Atomic BEEF and <span className="font-semibold text-foreground">spendable instantly</span>.
    </p>
  )
}

function WarnBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-input p-3" style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}>
      <WarningIcon size={16} style={{ color: 'var(--warn-icon)', flex: 'none', marginTop: 1 }} />
      <span className="text-[13px] leading-snug text-foreground">{children}</span>
    </div>
  )
}

function WalletBody({ phase }: { phase: Phase }) {
  return (
    <div>
      <Stepper phase={phase} />
      {phase === 'detecting' && (
        <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Looking for a BRC-100 wallet…
        </div>
      )}
      {phase === 'unavailable' && (
        <div className="text-center">
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            No BRC-100 wallet detected. Install BSV Browser, BSV Desktop, or Metanet. Or paste an address instead.
          </p>
          <span className={SECONDARY_CTA}>Paste an address instead</span>
        </div>
      )}
      {(phase === 'idle' || phase === 'idlewarn' || phase === 'claiming' || phase === 'error') && (
        <div className="flex flex-col gap-4">
          <WalletExplainer />
          {phase === 'idlewarn' && <WarnBand>Your wallet is on mainnet. These are Teratestnet coins and may not appear.</WarnBand>}
          {phase !== 'claiming' && <Captcha />}
          <span className={`${PRIMARY_CTA} ${phase === 'claiming' ? 'opacity-60' : ''}`}>
            {phase === 'claiming' ? 'Connecting…' : `Connect wallet & claim ${fmt(PAYOUT)} sats`}
            {phase !== 'claiming' && <ArrowRightIcon size={18} />}
          </span>
          {phase === 'error' && <p className="text-sm font-medium text-neg">internalizeAction rejected the payment</p>}
          <p className="text-center text-xs text-muted-foreground">No address to type, no key to paste, ~0.001 tBSV</p>
        </div>
      )}
      {phase === 'success' && (
        <div className="rounded-[14px] border border-pos bg-pos-bg p-[18px] text-center">
          <div className="mx-auto mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-pos">
            <CheckIcon size={24} className="text-primary-foreground" />
          </div>
          <div className="mb-1 font-display text-lg font-semibold text-foreground">Funds in your wallet</div>
          <div className="mb-[14px] text-[13.5px] leading-relaxed text-muted-foreground">
            {fmt(PAYOUT)} sats are now spendable. No confirmation needed.
          </div>
          <span className={SECONDARY_CTA}>Track transaction</span>
        </div>
      )}
    </div>
  )
}

function AddressBody({ state }: { state: 'empty' | 'generated' | 'busy' | 'error' | 'result' }) {
  const filled = state === 'generated' || state === 'result'
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[13.5px] font-medium text-foreground">Your Teratestnet address</span>
          <span className="text-[13px] font-semibold text-link">Generate a test key</span>
        </div>
        <div className="flex h-[50px] items-center rounded-input border-[1.5px] border-input-border bg-card px-[15px] font-mono text-sm text-foreground">
          {filled ? MOCK_ADDR : <span className="text-muted-foreground">m… or n…</span>}
        </div>
      </div>
      {state === 'generated' && (
        <div className="rounded-input bg-accent p-4">
          <div className="flex flex-col gap-2.5">
            {[
              { label: 'Address (auto-filled above)', value: MOCK_ADDR },
              { label: 'Private key (WIF)', value: MOCK_WIF },
            ].map((f) => (
              <div key={f.label}>
                <div className="mb-1 text-[11px] font-medium text-accent-foreground/70">{f.label}</div>
                <div className="flex w-full items-center gap-2 rounded-lg border border-hairline bg-card px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{f.value}</span>
                  <CopyIcon size={13} className="ml-auto flex-none text-link" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2">
            <WarningIcon size={14} style={{ color: 'var(--warn-icon)', flex: 'none', marginTop: 1 }} />
            <span className="text-[11.5px] leading-snug text-accent-foreground">
              Testing only. Save the WIF to spend these coins elsewhere; never use it for real funds.
            </span>
          </div>
        </div>
      )}
      <Captcha />
      <span className={`${PRIMARY_CTA} ${state === 'busy' ? 'opacity-60' : ''}`}>
        {state === 'busy' ? 'Sending…' : `Claim ${fmt(PAYOUT)} sats`}
      </span>
      {state === 'error' && <p className="text-center text-sm font-medium text-neg">Faucet drained, try again later</p>}
      {state === 'result' && (
        <div className="rounded-[14px] border border-pos bg-pos-bg p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-pos">
              <CheckIcon size={15} className="text-primary-foreground" />
            </span>
            <span className="font-display text-[15px] font-semibold text-foreground">Funds sent</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-link">
              Track <ArrowRightIcon size={13} />
            </span>
          </div>
          <div className="mb-[5px] text-[11px] font-medium text-muted-foreground">Extended format (EF)</div>
          <div className="max-h-16 overflow-auto break-all rounded-lg border border-hairline bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {MOCK_EF}
          </div>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">Each claim sends {fmt(PAYOUT)} sats (~0.001 tBSV) in extended format.</p>
    </div>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-hairline bg-card p-5">
      <div className="mb-3 inline-block rounded-md bg-accent px-2 py-[3px] text-[11px] font-medium text-accent-foreground">{label}</div>
      <div className="tnum font-display text-[27px] font-semibold text-foreground">{value}</div>
      <div className="mt-1.5 text-[11.5px]">{sub}</div>
    </div>
  )
}

function StaticModal({ onClose }: { onClose: () => void }) {
  const STEPS = [
    { label: 'Received', sub: 'Faucet accepted the request', state: 'done' },
    { label: 'Broadcast', sub: 'Sent to arcade', state: 'done' },
    { label: 'Accepted', sub: 'In the mempool, spendable now', state: 'current' },
    { label: 'Mined', sub: 'Awaiting the next block', state: 'next' },
  ] as const
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-[2px]" style={{ background: 'var(--scrim)' }} onClick={onClose}>
      <div className="w-[440px] max-w-[90%] overflow-hidden rounded-card border border-hairline bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline px-[22px] py-[18px]">
          <span className="font-display text-base font-semibold text-foreground">Transaction status</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-hairline text-muted-foreground hover:bg-band">
            <CloseIcon size={15} />
          </button>
        </div>
        <div className="px-[22px] py-5">
          <div className="mb-[18px] flex items-center justify-between rounded-[10px] bg-muted px-[14px] py-[11px]">
            <span className="font-mono text-xs text-foreground">a1b2c3d4e5f6…7e8f90</span>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-pos-bg px-2.5 py-1 text-xs font-medium text-pos">
              <span className="h-[7px] w-[7px] rounded-full bg-pos" />
              Accepted
            </span>
          </div>
          <div className="flex flex-col">
            {STEPS.map((s, i) => {
              const isLast = i === STEPS.length - 1
              const reached = s.state !== 'next'
              return (
                <div key={s.label} className="flex gap-[13px]">
                  <div className="flex flex-col items-center">
                    {s.state === 'done' || s.state === 'current' ? (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={s.state === 'current' ? { background: 'var(--primary)', boxShadow: '0 0 0 4px var(--accent)' } : { background: 'var(--pos)' }}>
                        <CheckIcon size={s.state === 'current' ? 11 : 12} className="text-primary-foreground" />
                      </span>
                    ) : (
                      <span className="spin h-[22px] w-[22px] rounded-full border-2 border-hairline" style={{ borderTopColor: 'var(--muted-fg)' }} />
                    )}
                    {!isLast && <span className="w-0.5 flex-1" style={{ minHeight: 18, background: reached ? 'var(--pos)' : 'var(--hairline)' }} />}
                  </div>
                  <div className={isLast ? '' : 'pb-4'}>
                    <div className={`text-sm font-semibold ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.sub}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <a href="#" className="mt-[18px] inline-flex items-center gap-1.5 text-[13px] font-semibold text-link">
            View on explorer <ExternalIcon size={14} />
          </a>
        </div>
      </div>
    </div>
  )
}

function Tile({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{title}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-6">
      <h2 className="border-b border-hairline pb-3 font-display text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2">{children}</div>
    </section>
  )
}

export default function StatesGallery() {
  const [modal, setModal] = useState(false)
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-band px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-pos" />
            DESIGN AID · mock data · no backend
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/" className="rounded-pill border border-hairline bg-band px-3 py-1.5 text-sm text-foreground hover:bg-muted">
              ← Back to app
            </Link>
          </div>
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground">Component States Gallery</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every visual state of every faucet panel, rendered statically with mock data. Flip the theme
          toggle (top-right) to review each state in light and dark. Faithful reproductions of the live
          markup; the Turnstile widget is a labelled placeholder.
        </p>
      </header>

      <Section id="wallet" title="Faucet card · Wallet · 1-click tab">
        <Tile title="detecting"><CardShell tab="wallet"><WalletBody phase="detecting" /></CardShell></Tile>
        <Tile title="unavailable"><CardShell tab="wallet"><WalletBody phase="unavailable" /></CardShell></Tile>
        <Tile title="idle"><CardShell tab="wallet"><WalletBody phase="idle" /></CardShell></Tile>
        <Tile title="idle + mainnet warning"><CardShell tab="wallet"><WalletBody phase="idlewarn" /></CardShell></Tile>
        <Tile title="claiming"><CardShell tab="wallet"><WalletBody phase="claiming" /></CardShell></Tile>
        <Tile title="error"><CardShell tab="wallet"><WalletBody phase="error" /></CardShell></Tile>
        <Tile title="success"><CardShell tab="wallet"><WalletBody phase="success" /></CardShell></Tile>
      </Section>

      <Section id="address" title="Faucet card · Paste-address tab">
        <Tile title="empty"><CardShell tab="address"><AddressBody state="empty" /></CardShell></Tile>
        <Tile title="generated key"><CardShell tab="address"><AddressBody state="generated" /></CardShell></Tile>
        <Tile title="busy"><CardShell tab="address"><AddressBody state="busy" /></CardShell></Tile>
        <Tile title="error"><CardShell tab="address"><AddressBody state="error" /></CardShell></Tile>
        <Tile title="result"><CardShell tab="address"><AddressBody state="result" /></CardShell></Tile>
      </Section>

      <Section id="stats" title="Stats grid">
        <Tile title="full grid" note="treasury = live; other 3 kept per client">
          <div className="grid grid-cols-1 gap-4 min-[620px]:grid-cols-2">
            <StatTile label="Sats dispensed" value="184,320,000" sub={<span className="font-medium text-pos">▲ live</span>} />
            <StatTile label="Claims today" value="1,287" sub={<span className="text-muted-foreground">across all subjects</span>} />
            <StatTile label="Treasury balance" value="42.5" sub={<span className="text-muted-foreground">BSV · refilled nightly</span>} />
            <StatTile label="Network throughput" value="1.04M tps" sub={<span className="text-muted-foreground">peak on Teranode testnet</span>} />
          </div>
        </Tile>
        <Tile title="treasury · 3 live states" note="from /api/balance">
          <div className="grid grid-cols-1 gap-4">
            <StatTile label="Treasury balance" value="…" sub={<span className="text-muted-foreground">loading</span>} />
            <StatTile label="Treasury balance" value="42.5" sub={<span className="text-muted-foreground">value</span>} />
            <StatTile label="Treasury balance" value="n/a" sub={<span className="text-muted-foreground">endpoint down</span>} />
          </div>
        </Tile>
      </Section>

      <Section id="modal" title="Transaction-status modal">
        <Tile title="modal" note="opens from any Track affordance">
          <button type="button" onClick={() => setModal(true)} className={SECONDARY_CTA}>
            Open transaction-status modal
          </button>
        </Tile>
      </Section>

      <footer className="mt-20 border-t border-hairline pt-6 text-xs text-muted-foreground">
        Static design aid · delete <code className="font-mono text-foreground">app/states/</code> after the overhaul · not linked from production.
      </footer>

      {modal && <StaticModal onClose={() => setModal(false)} />}
    </div>
  )
}
