'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { WalletClient, Utils } from '@bsv/sdk'
import {
  clearPendingClaim,
  loadPendingClaim,
  MobileClaimError,
  pollMobileClaim,
  startMobileClaim,
  type MobileClaimView,
  type NewMobileClaim,
} from '@/lib/mobile-claim-client'
// TODO: re-enable Turnstile — temporarily disabled.
// import { TurnstileWidget } from './TurnstileWidget'
import { ArrowRightIcon, CheckIcon, WarningIcon } from './icons'

type Phase = 'detecting' | 'unavailable' | 'mobile' | 'idle' | 'claiming' | 'success' | 'error'
type StepState = 'done' | 'active' | 'todo' | 'error'

const fmt = (n: number) => n.toLocaleString()
const tbsv = (n: number) => (n / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })

/** How often the page asks the server how a mobile claim is going. */
const MOBILE_POLL_MS = 2000

const STEP_LABELS = ['Connect', 'Authorize', 'Fund', 'Spendable'] as const
const STEP_MAP: Record<Exclude<Phase, 'mobile'>, StepState[]> = {
  detecting: ['active', 'todo', 'todo', 'todo'],
  unavailable: ['error', 'todo', 'todo', 'todo'],
  idle: ['done', 'active', 'todo', 'todo'],
  claiming: ['done', 'done', 'active', 'todo'],
  success: ['done', 'done', 'done', 'done'],
  error: ['done', 'done', 'error', 'todo'],
}

function StepCircle({ state, n }: { state: StepState; n: number }) {
  const base = 'step-dot flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] text-xs font-semibold'
  if (state === 'done')
    return (
      <span className={`${base} border-primary bg-primary text-primary-foreground`}>
        <CheckIcon size={13} />
      </span>
    )
  if (state === 'active')
    return <span className={`${base} border-primary bg-accent text-accent-foreground`}>{n}</span>
  if (state === 'error')
    return <span className={`${base} border-neg bg-neg-bg text-neg`}>!</span>
  return <span className={`${base} border-hairline bg-transparent text-muted-foreground`}>{n}</span>
}

function Stepper({ states }: { states: StepState[] }) {
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

const PRIMARY_CTA =
  'shine flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-semibold text-primary-foreground shadow-primary disabled:cursor-not-allowed disabled:opacity-60'
const SECONDARY_CTA =
  'inline-flex h-11 w-full items-center justify-center rounded-pill border-[1.5px] border-[color:var(--btn2-bd)] bg-transparent px-[22px] text-sm font-semibold text-[color:var(--btn2-fg)] transition min-[620px]:w-auto'

/** "Need a wallet?" download prompt — shown while detecting and when no wallet is found. */
function DownloadHint() {
  return (
    <p className="w-full text-[13px] leading-relaxed text-muted-foreground">
      Need a wallet? Download{' '}
      <a href="https://desktop.bsvb.tech/" target="_blank" rel="noreferrer" className="font-medium text-link">
        BSV Desktop
      </a>{' '}
      or{' '}
      <a href="https://mobile.bsvb.tech/" target="_blank" rel="noreferrer" className="font-medium text-link">
        BSV Browser
      </a>{' '}
      for mobile.
    </p>
  )
}

function InfoBand({ children, pulse = 'ping' }: { children: React.ReactNode; pulse?: 'ping' | 'dot' }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-input border border-primary/20 bg-primary/10 p-3 text-[13px] leading-snug text-foreground">
      {pulse === 'ping' ? (
        <span className="relative flex h-2 w-2 flex-none">
          <span className="ping-ring absolute inline-flex h-full w-full rounded-full bg-primary" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      ) : (
        <span className="dotpulse h-2 w-2 flex-none rounded-full bg-primary" />
      )}
      <span>{children}</span>
    </div>
  )
}

function ErrorBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full items-start gap-2.5 rounded-input border border-neg bg-neg-bg p-3">
      <WarningIcon size={16} className="mt-[1px] flex-none text-neg" />
      <span className="text-[13px] font-medium leading-snug text-foreground">{children}</span>
    </div>
  )
}

function Success({ amount, note, onTrack }: { amount: number; note?: string; onTrack: () => void }) {
  return (
    <div className="rounded-[14px] border border-pos bg-pos-bg p-[18px] text-center">
      <div className="mx-auto mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-pos">
        <CheckIcon size={24} className="text-primary-foreground" />
      </div>
      <div className="mb-1 font-display text-lg font-semibold text-foreground">Funds in your wallet</div>
      <div className="mb-[14px] text-[13.5px] leading-relaxed text-muted-foreground">
        {fmt(amount)} sats are now spendable. No confirmation needed.{note ? ` ${note}` : ''}
      </div>
      <button type="button" onClick={onTrack} className={`${SECONDARY_CTA} hover:bg-band`}>
        Track transaction
      </button>
    </div>
  )
}

type MobileView = MobileClaimView | { state: 'starting' }

const COARSE_POINTER = '(pointer: coarse)'
/** True on touch-first devices (phones/tablets), where the deep link is the primary action. */
function useOnPhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(COARSE_POINTER)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  )
}

const MOBILE_STEPS: Record<MobileView['state'], StepState[]> = {
  starting: ['active', 'todo', 'todo', 'todo'],
  waiting: ['active', 'todo', 'todo', 'todo'],
  claiming: ['done', 'done', 'active', 'todo'],
  done: ['done', 'done', 'done', 'done'],
  error: ['done', 'done', 'error', 'todo'],
  expired: ['error', 'todo', 'todo', 'todo'],
}

/**
 * Claim with BSV Wallet on a phone, paired over @bsv/wallet-relay. Approving the pairing in the
 * wallet IS the claim: the faucet server pays and delivers while the wallet is still open (on one
 * phone the browser is frozen meanwhile), and this panel just shows the outcome.
 */
function MobileClaim({
  payoutSats,
  onUnavailable,
  onUsePaste,
  onTrack,
}: {
  payoutSats: number
  onUnavailable: () => void
  onUsePaste: () => void
  onTrack: (txid: string) => void
}) {
  // Resume a claim started earlier in this tab: the page may have reloaded while the user was in
  // BSV Wallet. (This panel only renders client-side, after wallet detection.)
  const [resumed] = useState(loadPendingClaim)
  const [claim, setClaim] = useState<NewMobileClaim | null>(resumed)
  const [view, setView] = useState<MobileView>({ state: resumed ? 'waiting' : 'starting' })
  const onPhone = useOnPhone()
  const mounted = useRef(true)

  /** Create a claim and show its QR. Only sets state after the request, so it's effect-safe. */
  const begin = useCallback(async (alive: () => boolean = () => mounted.current) => {
    try {
      const created = await startMobileClaim()
      if (!alive()) return
      setClaim(created)
      setView({ state: 'waiting' })
    } catch (err) {
      if (!alive()) return
      // Disabled/unreachable relay → the plain "no wallet detected" panel.
      if (!(err instanceof MobileClaimError) || err.status >= 500) return onUnavailable()
      setView({ state: 'error', code: 'failed', error: err.message })
    }
  }, [onUnavailable])

  const start = useCallback(() => {
    setClaim(null)
    setView({ state: 'starting' })
    void begin()
  }, [begin])

  // On mount, start a claim unless one was resumed (the view is already 'starting'). begin() only
  // sets state once its request settles; the async wrapper makes that visible to the React compiler.
  useEffect(() => {
    let cancelled = false
    mounted.current = true
    if (!resumed) void (async () => begin(() => !cancelled))()
    return () => {
      cancelled = true
      mounted.current = false
    }
  }, [resumed, begin])

  // Ask the server how the claim is going, every few seconds and as soon as the tab is shown
  // again (mobile browsers pause timers while the user is in the wallet app).
  const sessionId = claim?.sessionId
  const live = view.state === 'waiting' || view.state === 'claiming'
  useEffect(() => {
    if (!sessionId || !live) return
    let cancelled = false
    const poll = async () => {
      const next = await pollMobileClaim(sessionId).catch(() => undefined)
      if (cancelled || next === undefined) return
      if (next === null) {
        // The server no longer knows this claim (e.g. it restarted): start over.
        clearPendingClaim()
        return start()
      }
      if (next.state !== 'waiting' && next.state !== 'claiming') clearPendingClaim()
      setView(next)
    }
    void poll()
    const timer = setInterval(poll, MOBILE_POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void poll()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [sessionId, live, start])

  const openWallet = claim && (
    <a href={claim.pairingUri} className={`${PRIMARY_CTA} shine-loop`}>
      Claim {fmt(payoutSats)} sats with BSV Wallet
      <ArrowRightIcon size={18} />
    </a>
  )
  const qr = claim && (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from the relay */}
      <img
        src={claim.qrDataUrl}
        alt="QR code to claim with BSV Wallet"
        width={220}
        height={220}
        className="rounded-input border border-hairline bg-white p-2"
      />
      <span className="text-xs text-muted-foreground">
        {onPhone ? 'Or scan from another phone with BSV Wallet' : 'Scan with BSV Wallet on your phone'}
      </span>
    </div>
  )
  const pasteLink = (
    <button type="button" onClick={onUsePaste} className="text-[13px] font-medium text-link">
      Paste an address instead
    </button>
  )

  return (
    <div>
      <Stepper states={MOBILE_STEPS[view.state]} />

      {view.state === 'starting' && (
        <div className="flex flex-col gap-3">
          <InfoBand>No browser wallet found. Preparing a claim for BSV Wallet…</InfoBand>
          <DownloadHint />
        </div>
      )}

      {view.state === 'waiting' && claim && (
        <div className="flex flex-col items-center gap-4">
          <InfoBand>
            No browser wallet found. Claim with BSV Wallet: approve the connection and the coins arrive
            straight away.
          </InfoBand>
          {onPhone ? (
            <>
              {openWallet}
              {qr}
            </>
          ) : (
            <>
              {qr}
              <a href={claim.pairingUri} className={`${SECONDARY_CTA} hover:bg-band`}>
                On your phone? Open BSV Wallet
              </a>
            </>
          )}
          <p className="w-full text-center text-xs leading-relaxed text-muted-foreground">
            Make sure BSV Wallet is on Teratestnet, and stay in it for a couple of seconds after
            approving while the coins arrive.
          </p>
          <DownloadHint />
          {pasteLink}
        </div>
      )}

      {view.state === 'claiming' && (
        <div className="flex flex-col gap-4">
          <InfoBand pulse="dot">BSV Wallet connected. Sending {fmt(payoutSats)} sats to it…</InfoBand>
          <p className="text-center text-xs text-muted-foreground">Keep BSV Wallet open until it shows the coins.</p>
        </div>
      )}

      {view.state === 'done' && (
        <Success
          amount={view.amount ?? payoutSats}
          note={view.redelivered ? 'This was your earlier payout, now delivered.' : undefined}
          onTrack={() => view.txid && onTrack(view.txid)}
        />
      )}

      {view.state === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <ErrorBand>
            {view.error ?? 'Something went wrong.'}
            {view.txid && (
              <>
                {' '}
                <button type="button" onClick={() => onTrack(view.txid!)} className="font-medium text-link">
                  Track transaction
                </button>
              </>
            )}
          </ErrorBand>
          <button type="button" onClick={start} className={`${SECONDARY_CTA} hover:bg-band`}>
            Try again
          </button>
          {pasteLink}
        </div>
      )}

      {view.state === 'expired' && (
        <div className="flex flex-col items-start gap-4">
          <ErrorBand>The claim code expired before BSV Wallet connected.</ErrorBand>
          <button type="button" onClick={start} className={`${SECONDARY_CTA} hover:bg-band`}>
            Show a new code
          </button>
          {pasteLink}
        </div>
      )}
    </div>
  )
}

/** Wallet tab of the faucet card — one-click BRC-100 claim, internalized as Atomic BEEF. */
export function WalletPanel({
  siteKey,
  payoutSats,
  onUsePaste,
  onTrack,
}: {
  siteKey: string
  payoutSats: number
  onUsePaste: () => void
  onTrack: (txid: string) => void
}) {
  const wallet = useRef<WalletClient | null>(null)
  const [phase, setPhase] = useState<Phase>('detecting')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ txid: string; amount: number } | null>(null)
  const [networkWarning, setNetworkWarning] = useState('')
  const [networkOk, setNetworkOk] = useState(false)

  const onMobileUnavailable = useCallback(() => setPhase('unavailable'), [])

  // On load: resume a mobile claim from earlier in this tab, else detect a local BRC-100 wallet,
  // else claim with a mobile wallet. WalletClient('auto') is lazy (safe to construct), but its
  // first call has no built-in connect timeout — so probe getVersion() inside a Promise.race.
  useEffect(() => {
    let cancelled = false
    const w = new WalletClient('auto')
    ;(async () => {
      if (loadPendingClaim()) return setPhase('mobile')
      const detected = await Promise.race([
        w.getVersion().then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 1500)),
      ]).catch(() => false)
      if (cancelled) return
      if (!detected) return setPhase('mobile')
      wallet.current = w
      setPhase('idle')
      // A teratestnet wallet reports 'testnet'; only 'mainnet' is a real mismatch worth flagging.
      w.getNetwork()
        .then(({ network }) => {
          if (cancelled) return
          if (network === 'mainnet') {
            setNetworkWarning("Your wallet is on mainnet. Switch it to Teratestnet before claiming, or these coins won't appear.")
          } else {
            setNetworkOk(true)
          }
        })
        .catch(() => {})
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function claim() {
    const w = wallet.current
    if (!w) return
    setPhase('claiming')
    setError('')
    setResult(null)
    try {
      const { publicKey: identityKey } = await w.getPublicKey({ identityKey: true })
      const res = await fetch('/api/claim/wallet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identityKey, captchaToken: token }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      // From here the payout is already broadcast — keep its txid so a failed accept is traceable.
      setResult({ txid: json.txid, amount: json.amount })
      await w.internalizeAction({
        tx: Utils.toArray(json.atomicBEEF, 'hex'), // hex -> number[]; a raw hex string fails Beef.fromBinary
        description: 'Teratestnet faucet payout', // required, >= 5 chars
        labels: ['faucet'],
        outputs: [
          {
            outputIndex: json.outputIndex,
            protocol: 'wallet payment',
            paymentRemittance: {
              derivationPrefix: json.derivationPrefix,
              derivationSuffix: json.derivationSuffix,
              senderIdentityKey: json.senderIdentityKey,
            },
          },
        ],
      })
      setPhase('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setPhase('error')
    }
  }

  if (phase === 'mobile') {
    return (
      <MobileClaim
        payoutSats={payoutSats}
        onUnavailable={onMobileUnavailable}
        onUsePaste={onUsePaste}
        onTrack={onTrack}
      />
    )
  }

  const busy = phase === 'claiming'

  return (
    <div>
      <Stepper states={STEP_MAP[phase]} />

      {phase === 'detecting' && (
        <div className="flex flex-col gap-3">
          <InfoBand>Looking for a BRC-100 wallet…</InfoBand>
          <DownloadHint />
        </div>
      )}

      {phase === 'unavailable' && (
        <div className="flex flex-col items-start gap-4">
          <ErrorBand>No BRC-100 wallet detected.</ErrorBand>
          <DownloadHint />
          <button type="button" onClick={onUsePaste} className={`${SECONDARY_CTA} hover:bg-band`}>
            Paste an address instead
          </button>
        </div>
      )}

      {(phase === 'idle' || phase === 'claiming' || phase === 'error') && (
        <div className="flex flex-col gap-4">
          {phase === 'idle' && networkOk && (
            <div className="flex items-start gap-2.5 rounded-input border border-pos bg-pos-bg p-3">
              <CheckIcon size={16} className="mt-[1px] flex-none text-pos" />
              <span className="text-[13px] leading-snug text-foreground">
                Your wallet is connected and on Teratestnet.
              </span>
            </div>
          )}

          {phase === 'idle' && networkWarning && (
            <div
              className="flex items-start gap-2.5 rounded-input p-3"
              style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}
            >
              <WarningIcon size={16} style={{ color: 'var(--warn-icon)', flex: 'none', marginTop: 1 }} />
              <span className="text-[13px] leading-snug text-foreground">{networkWarning}</span>
            </div>
          )}

          {phase === 'claiming' && <InfoBand pulse="dot">Approve the request in your wallet…</InfoBand>}

          {phase === 'error' && (
            <ErrorBand>
              {result ? `The payout was sent, but your wallet didn't accept it: ${error}` : error}
              {result && (
                <>
                  {' '}
                  <button type="button" onClick={() => onTrack(result.txid)} className="font-medium text-link">
                    Track transaction
                  </button>
                </>
              )}
            </ErrorBand>
          )}

          <p className="text-sm leading-relaxed text-muted-foreground">
            We&apos;ll pay a BRC-29 output straight to your identity key, internalized as Atomic BEEF
            and <span className="font-semibold text-foreground">spendable instantly</span>.
          </p>

          {/* TODO: re-enable Turnstile — and restore `!token` in the button's disabled below. */}
          {/* {(phase === 'idle' || phase === 'error') && <TurnstileWidget siteKey={siteKey} onToken={setToken} />} */}

          <button
            type="button"
            onClick={claim}
            disabled={busy}
            className={`${PRIMARY_CTA} shine-loop`}
          >
            {busy ? 'Claiming…' : `Claim ${fmt(payoutSats)} sats`}
            {!busy && <ArrowRightIcon size={18} />}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            No address to type, no key to paste, ~{tbsv(payoutSats)} tBSV
          </p>
        </div>
      )}

      {phase === 'success' && result && <Success amount={result.amount} onTrack={() => onTrack(result.txid)} />}
    </div>
  )
}
