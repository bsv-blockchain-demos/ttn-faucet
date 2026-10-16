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
import { NETWORKS, type NetworkId } from '@/lib/networks'
// TODO: re-enable Turnstile — temporarily disabled.
// import { TurnstileWidget } from './TurnstileWidget'
import { ArrowRightIcon, CheckIcon, MonitorIcon, PhoneIcon, WarningIcon } from './icons'
import { useNetwork } from './NetworkProvider'

type Phase = 'detecting' | 'unavailable' | 'mobile' | 'idle' | 'claiming' | 'success' | 'error'

const fmt = (n: number) => n.toLocaleString()

/** How often the page asks the server how a mobile claim is going. */
const MOBILE_POLL_MS = 2000

/** How long to wait for a local BRC-100 wallet to answer getNetwork before offering downloads. */
const DETECT_TIMEOUT_MS = 1500

const PRIMARY_CTA =
  'shine flex min-h-[56px] w-full items-center justify-center gap-2 rounded-pill bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-primary disabled:cursor-not-allowed disabled:opacity-60'
const SECONDARY_CTA =
  'inline-flex h-11 w-full items-center justify-center rounded-pill border-[1.5px] border-[color:var(--btn2-bd)] bg-transparent px-[22px] text-sm font-semibold text-[color:var(--btn2-fg)] transition min-[620px]:w-auto'

const DOWNLOADS = [
  { name: 'BSV Desktop', sub: 'Mac, Windows & Linux', href: 'https://desktop.bsvb.tech/', Icon: MonitorIcon },
  { name: 'BSV Browser', sub: 'iOS & Android', href: 'https://mobile.bsvb.tech/', Icon: PhoneIcon },
] as const

/** CTA label: the amount, then the network on its own line so it's never missed or truncated. */
function ClaimLabel({ payoutSats, networkName }: { payoutSats: number; networkName: string }) {
  return (
    <>
      <span className="flex flex-col items-center py-1.5 leading-tight">
        <span>Claim {fmt(payoutSats)} sats</span>
        <span className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium opacity-90">
          on
          <span className="h-2 w-2 rounded-full bg-net ring-[1.5px] ring-white/80" aria-hidden />
          {networkName}
        </span>
      </span>
      <ArrowRightIcon size={18} />
    </>
  )
}

/** No wallet answered: the way forward is installing one, so the downloads lead. */
function GetAWallet() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <WarningIcon size={16} style={{ color: 'var(--warn-icon)', flex: 'none', marginTop: 2 }} />
        <div className="text-[13.5px] leading-snug text-foreground">
          <span className="font-semibold">No BRC-100 wallet found.</span>{' '}
          <span className="text-muted-foreground">Install one, open this page again, and claim in one click.</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
        {DOWNLOADS.map(({ name, sub, href, Icon }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="lift flex items-center gap-3 rounded-input border-[1.5px] border-input-border bg-card px-3.5 py-3 transition hover:border-primary"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
              <Icon size={18} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[14px] font-semibold text-foreground">Get {name}</span>
              <span className="block text-[12px] text-muted-foreground">{sub}</span>
            </span>
            <ArrowRightIcon size={15} className="ml-auto flex-none text-link" />
          </a>
        ))}
      </div>
    </div>
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

function WarnBand({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-input p-3"
      style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}
    >
      <WarningIcon size={16} style={{ color: 'var(--warn-icon)', flex: 'none', marginTop: 1 }} />
      <span className="text-[13px] leading-snug text-foreground">{children}</span>
    </div>
  )
}

function Success({
  amount,
  network,
  note,
  onTrack,
  onAgain,
}: {
  amount: number
  network: NetworkId
  note?: string
  onTrack: () => void
  onAgain?: () => void
}) {
  return (
    <div className="rounded-[14px] border border-pos bg-pos-bg p-[18px] text-center">
      <div className="mx-auto mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-pos">
        <CheckIcon size={24} className="text-primary-foreground" />
      </div>
      <div className="mb-1 font-display text-lg font-semibold text-foreground">Funds in your wallet</div>
      <div className="mb-[14px] text-[13.5px] leading-relaxed text-muted-foreground">
        {fmt(amount)} sats on {NETWORKS[network].name} are spendable now. No confirmation needed.
        {note ? ` ${note}` : ''}
      </div>
      <div className="flex flex-col items-center justify-center gap-2.5 min-[420px]:flex-row">
        <button type="button" onClick={onTrack} className={`${SECONDARY_CTA} hover:bg-band`}>
          Track transaction
        </button>
        {onAgain && (
          <button type="button" onClick={onAgain} className="text-[13px] font-semibold text-link">
            Claim again
          </button>
        )}
      </div>
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

/**
 * No browser wallet: lead with the wallet downloads, and offer a claim with BSV Wallet on a phone,
 * paired over @bsv/wallet-relay. Approving the pairing in the wallet IS the claim: the faucet
 * server pays and delivers while the wallet is still open (on one phone the browser is frozen
 * meanwhile), and this panel just shows the outcome. Keyed by network: switching networks starts
 * a fresh claim.
 */
function MobileClaim({
  network,
  payoutSats,
  onUnavailable,
  onUsePaste,
  onTrack,
  onBusy,
}: {
  network: NetworkId
  payoutSats: number
  onUnavailable: () => void
  onUsePaste: () => void
  onTrack: (txid: string) => void
  onBusy: (busy: boolean) => void
}) {
  const networkName = NETWORKS[network].name
  // Resume a claim started earlier in this tab: the page may have reloaded while the user was in
  // BSV Wallet. (This panel only renders client-side, after wallet detection.)
  const [resumed] = useState(() => loadPendingClaim(network))
  const [claim, setClaim] = useState<NewMobileClaim | null>(resumed)
  const [view, setView] = useState<MobileView>({ state: resumed ? 'waiting' : 'starting' })
  const onPhone = useOnPhone()
  const mounted = useRef(true)

  useEffect(() => onBusy(view.state === 'claiming'), [view.state, onBusy])

  /** Create a claim and show its QR. Only sets state after the request, so it's effect-safe. */
  const begin = useCallback(
    async (alive: () => boolean = () => mounted.current) => {
      try {
        const created = await startMobileClaim(network)
        if (!alive()) return
        setClaim(created)
        setView({ state: 'waiting' })
      } catch (err) {
        if (!alive()) return
        // Disabled/unreachable relay → downloads only.
        if (!(err instanceof MobileClaimError) || err.status >= 500) return onUnavailable()
        setView({ state: 'error', code: 'failed', error: err.message })
      }
    },
    [network, onUnavailable],
  )

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

  const pasteLink = (
    <button type="button" onClick={onUsePaste} className="self-center text-[13px] font-medium text-link">
      Paste an address instead
    </button>
  )

  if (view.state === 'claiming') {
    return (
      <div className="flex flex-col gap-4">
        <InfoBand pulse="dot">
          BSV Wallet connected. Sending {fmt(payoutSats)} sats on {networkName}…
        </InfoBand>
        <p className="text-center text-xs text-muted-foreground">Keep BSV Wallet open until it shows the coins.</p>
      </div>
    )
  }

  if (view.state === 'done') {
    return (
      <Success
        amount={view.amount ?? payoutSats}
        network={network}
        note={view.redelivered ? 'This was your earlier payout, now delivered.' : undefined}
        onTrack={() => view.txid && onTrack(view.txid)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <GetAWallet />

      <div className="flex items-center gap-3 text-[12px] font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-hairline" />
        Already have BSV Wallet on your phone?
        <span className="h-px flex-1 bg-hairline" />
      </div>

      {view.state === 'starting' && <InfoBand>Preparing a phone claim…</InfoBand>}

      {view.state === 'waiting' && claim && (
        <div className="flex flex-col items-center gap-3">
          {onPhone && (
            <a href={claim.pairingUri} className={`${PRIMARY_CTA} shine-loop`}>
              <ClaimLabel payoutSats={payoutSats} networkName={networkName} />
            </a>
          )}
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from the relay */}
            <img
              src={claim.qrDataUrl}
              alt={`QR code to claim on ${networkName} with BSV Wallet`}
              width={180}
              height={180}
              className="rounded-input border border-hairline bg-white p-2"
            />
            <span className="text-xs text-muted-foreground">
              {onPhone ? 'Or scan from another phone with BSV Wallet' : 'Scan with BSV Wallet to claim'}
            </span>
          </div>
          <p className="w-full text-center text-xs leading-relaxed text-muted-foreground">
            Set BSV Wallet to <span className="font-semibold text-net">{networkName}</span> first, and stay in it
            for a couple of seconds after approving while the coins arrive.
          </p>
        </div>
      )}

      {view.state === 'error' && (
        <div className="flex flex-col items-start gap-3">
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
        </div>
      )}

      {view.state === 'expired' && (
        <div className="flex flex-col items-start gap-3">
          <ErrorBand>The claim code expired before BSV Wallet connected.</ErrorBand>
          <button type="button" onClick={start} className={`${SECONDARY_CTA} hover:bg-band`}>
            Show a new code
          </button>
        </div>
      )}

      {pasteLink}
    </div>
  )
}

/**
 * Wallet tab of the faucet card — one-click BRC-100 claim on the selected network, internalized
 * as Atomic BEEF. Detection is the wallet's getNetwork: no answer means no wallet (show
 * downloads); 'mainnet' blocks the claim; 'testnet' could be any test network, so the picker decides.
 */
export function WalletPanel({
  siteKey,
  payoutSats,
  onUsePaste,
  onTrack,
  onBusy,
}: {
  siteKey: string
  payoutSats: number
  onUsePaste: () => void
  onTrack: (txid: string) => void
  onBusy: (busy: boolean) => void
}) {
  const { network } = useNetwork()
  const networkName = NETWORKS[network].name
  const wallet = useRef<WalletClient | null>(null)
  const [phase, setPhase] = useState<Phase>('detecting')
  const [walletNetwork, setWalletNetwork] = useState<'mainnet' | 'testnet' | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ txid: string; amount: number; network: NetworkId } | null>(null)

  const onMobileUnavailable = useCallback(() => setPhase('unavailable'), [])
  useEffect(() => onBusy(phase === 'claiming'), [phase, onBusy])

  // A finished claim belongs to the network it was made on: switching networks goes back to idle.
  const [shownNetwork, setShownNetwork] = useState(network)
  if (shownNetwork !== network) {
    setShownNetwork(network)
    if (phase === 'success' || phase === 'error') setPhase('idle')
  }

  // On load: resume a mobile claim from earlier in this tab, else ask a local BRC-100 wallet which
  // network it's on, else go to the no-wallet panel. WalletClient('auto') is lazy (safe to
  // construct), but its first call has no built-in connect timeout — so race it.
  useEffect(() => {
    let cancelled = false
    const w = new WalletClient('auto')
    ;(async () => {
      if (loadPendingClaim()) return setPhase('mobile')
      const detected = await Promise.race([
        w.getNetwork({}).then(({ network }) => network),
        new Promise<null>((r) => setTimeout(() => r(null), DETECT_TIMEOUT_MS)),
      ]).catch(() => null)
      if (cancelled) return
      if (!detected) return setPhase('mobile')
      wallet.current = w
      setWalletNetwork(detected)
      setPhase('idle')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function claim() {
    const w = wallet.current
    if (!w) return
    const claimNetwork = network
    setPhase('claiming')
    setError('')
    setResult(null)
    try {
      const { publicKey: identityKey } = await w.getPublicKey({ identityKey: true })
      const res = await fetch('/api/claim/wallet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identityKey, network: claimNetwork, captchaToken: token }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      // From here the payout is already broadcast — keep its txid so a failed accept is traceable.
      setResult({ txid: json.txid, amount: json.amount, network: claimNetwork })
      await w.internalizeAction({
        tx: Utils.toArray(json.atomicBEEF, 'hex'), // hex -> number[]; a raw hex string fails Beef.fromBinary
        description: `${NETWORKS[claimNetwork].name} faucet payout`, // required, >= 5 chars
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
        key={network}
        network={network}
        payoutSats={payoutSats}
        onUnavailable={onMobileUnavailable}
        onUsePaste={onUsePaste}
        onTrack={onTrack}
        onBusy={onBusy}
      />
    )
  }

  if (phase === 'detecting') return <InfoBand>Looking for a BRC-100 wallet…</InfoBand>

  if (phase === 'unavailable') {
    return (
      <div className="flex flex-col gap-4">
        <GetAWallet />
        <button type="button" onClick={onUsePaste} className="self-center text-[13px] font-medium text-link">
          Paste an address instead
        </button>
      </div>
    )
  }

  if (phase === 'success' && result) {
    return (
      <Success
        amount={result.amount}
        network={result.network}
        onTrack={() => onTrack(result.txid)}
        onAgain={() => setPhase('idle')}
      />
    )
  }

  const busy = phase === 'claiming'
  const onMainnet = walletNetwork === 'mainnet'

  return (
    <div className="flex flex-col gap-3.5">
      {phase === 'idle' && onMainnet && (
        <WarnBand>
          Your wallet is on <span className="font-semibold">mainnet</span>. Switch it to {networkName}, then reload
          this page to claim.
        </WarnBand>
      )}

      {phase === 'idle' && !onMainnet && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CheckIcon size={15} className="flex-none text-pos" />
          <span>
            Wallet connected. Check it&apos;s set to <span className="font-semibold text-net">{networkName}</span>.
          </span>
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

      {/* TODO: re-enable Turnstile — and restore `!token` in the button's disabled below. */}
      {/* {(phase === 'idle' || phase === 'error') && <TurnstileWidget siteKey={siteKey} onToken={setToken} />} */}

      <button type="button" onClick={claim} disabled={busy || onMainnet} className={`${PRIMARY_CTA} shine-loop`}>
        {busy ? 'Claiming…' : <ClaimLabel payoutSats={payoutSats} networkName={networkName} />}
      </button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Paid straight to your wallet as Atomic BEEF:{' '}
        <span className="font-semibold text-foreground">spendable instantly</span>, nothing to copy or paste.
      </p>
    </div>
  )
}
