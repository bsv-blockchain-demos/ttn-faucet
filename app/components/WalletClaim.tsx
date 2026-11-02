'use client'
import { withBasePath } from '@/lib/base-path'
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
import { CheckIcon, WarningIcon } from './icons'
import { AndroidLogo, AppleLogo, ArrowUpRight, LinuxLogo, WindowsLogo } from '@phosphor-icons/react/dist/ssr'
import { useNetwork } from './NetworkProvider'
import { BusyLabel, ClaimLabel } from './ClaimLabel'
import { BTN_CLAIM, BTN_SECONDARY } from './buttons'

type Phase = 'detecting' | 'unavailable' | 'mobile' | 'idle' | 'claiming' | 'success' | 'error'

const fmt = (n: number) => n.toLocaleString()

/** How often the page asks the server how a mobile claim is going. */
const MOBILE_POLL_MS = 2000

/** How long to wait for a local BRC-100 wallet to answer getNetwork before offering downloads. */
const DETECT_TIMEOUT_MS = 1500

const SECONDARY_CTA = `${BTN_SECONDARY} w-full min-[620px]:w-auto`
const TEXT_LINK = 'font-medium text-primary underline-offset-4 hover:underline'

/** No wallet answered: the way forward is installing one, so the download leads. */
function GetAWallet() {
  return (
    <div className="flex flex-col gap-3">
      {/* The icon is inline, so a centred line that wraps keeps it beside the first word. */}
      <p className="text-center text-sm leading-snug text-balance text-foreground">
        <WarningIcon size={16} className="me-1.5 inline-block -translate-y-px align-middle text-primary" />
        <span className="font-medium">No BRC-100 wallet found.</span>{' '}
        <span className="text-ink-muted">Install one, open this page again, and claim in one click.</span>
      </p>
      <BrowserPromo />
    </div>
  )
}

const PLATFORMS = [
  { name: 'iPhone & Mac', Icon: AppleLogo },
  { name: 'Android', Icon: AndroidLogo },
  { name: 'Windows', Icon: WindowsLogo },
  { name: 'Linux', Icon: LinuxLogo },
] as const

/**
 * The BSV Browser download, as one card in the style of its own share image (browser.bsvb.tech's
 * og-image): deep navy with a teal glow, one bold white line, the device line-up, and the platforms.
 * The call to action sits top right where the eye starts; the platforms sit on the artwork, each on
 * a dark radial matte so they hold up over the bright laptop screen. The whole card is the link,
 * and it stays dark in both themes, like the artwork it comes from.
 */
function BrowserPromo() {
  return (
    <a
      href="https://browser.bsvb.tech/"
      target="_blank"
      rel="noreferrer noopener"
      data-glow=""
      className="browser-promo group relative isolate block overflow-hidden rounded-lg text-white ring-1 ring-white/10 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <div className="relative z-10 px-6 pt-6 min-[480px]:px-7 min-[480px]:pt-7">
        <div className="flex items-center justify-between gap-4">
          <p className="label-sm text-brand-cyan uppercase">BSV Browser</p>
          <span className="inline-flex h-11 flex-none items-center gap-2 rounded-md bg-white px-5 text-sm font-medium text-[var(--promo-base)] shadow-[0_6px_16px_-8px_rgb(0_0_0/0.6)] transition-transform duration-150 group-hover:-translate-y-px">
            Get BSV Browser
            <ArrowUpRight aria-hidden className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
        <p className="mt-4 max-w-[22ch] text-[1.375rem] leading-[1.15] font-bold tracking-[-0.025em] text-balance">
          A web browser with your wallet, identity and data built in.
        </p>
      </div>

      {/* The whole line-up, sized to the card and bleeding off the right edge like the share image.
          The box is a little shorter than the artwork, so the bottom of the devices is cropped here,
          inside the card, and the platform row sits in what's visible. */}
      <div className="relative mt-5 aspect-[100/42] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- static artwork; basePath-aware via withBasePath */}
        <img
          src={withBasePath('/brand/bsv-browser-devices.webp')}
          alt=""
          aria-hidden
          width={1400}
          height={650}
          className="relative left-[5%] block h-auto w-[104%] max-w-none transition-transform duration-500 ease-out group-hover:-translate-y-1.5"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--promo-base)] via-[var(--promo-base)]/60 to-transparent" />

        {/* Platforms, over the artwork's lower edge. A soft vignette under the row, then a radial
            matte per icon: darkest at the centre, so a white glyph reads over any part of the image. */}
        <ul className="absolute bottom-5 left-6 z-10 flex items-center gap-2 min-[480px]:left-7">
          <li aria-hidden className="pointer-events-none absolute -inset-x-8 -inset-y-6 -z-10 bg-[radial-gradient(closest-side,rgb(5_12_24/0.75),transparent)]" />
          {PLATFORMS.map(({ name, Icon }) => (
            <li
              key={name}
              title={name}
              className="flex size-10 items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_35%,rgb(5_12_24/0.95)_0%,rgb(5_12_24/0.8)_60%,rgb(5_12_24/0.55)_100%)] ring-1 ring-white/15 shadow-[0_4px_14px_-4px_rgb(0_0_0/0.7)]"
            >
              <Icon aria-hidden weight="fill" className="size-5 text-white" />
              <span className="sr-only">{name}</span>
            </li>
          ))}
        </ul>
      </div>
    </a>
  )
}

function InfoBand({ children, pulse = 'ping' }: { children: React.ReactNode; pulse?: 'ping' | 'dot' }) {
  return (
    <div
      role="status"
      className="flex w-full items-center gap-2.5 rounded-md border border-info-bd bg-info-bg p-3 text-sm leading-snug text-foreground"
    >
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
    <div role="alert" className="flex w-full items-start gap-2.5 rounded-md border border-destructive/40 bg-neg-bg p-3">
      <WarningIcon size={16} className="mt-px flex-none text-destructive" />
      <span className="text-sm font-medium leading-snug text-foreground">{children}</span>
    </div>
  )
}

function WarnBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-neg-bg p-3">
      <WarningIcon size={16} className="mt-px flex-none text-destructive" />
      <span className="text-sm leading-snug text-foreground">{children}</span>
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
    <div role="status" className="rounded-md border border-pos/40 bg-pos-bg p-5 text-center">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-pos">
        <CheckIcon size={22} weight="bold" className="text-primary-foreground" />
      </div>
      <div className="headline-md mb-1 text-foreground">Funds in your wallet</div>
      <div className="mb-4 text-sm leading-relaxed text-ink-muted">
        {fmt(amount)} sats on {NETWORKS[network].name} are spendable now. No confirmation needed.
        {note ? ` ${note}` : ''}
      </div>
      <div className="flex flex-col items-center justify-center gap-2.5 min-[420px]:flex-row">
        <button type="button" onClick={onTrack} className={SECONDARY_CTA}>
          Track transaction
        </button>
        {onAgain && (
          <button type="button" onClick={onAgain} className={`text-sm ${TEXT_LINK}`}>
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
    <button type="button" onClick={onUsePaste} className={`self-center text-sm ${TEXT_LINK}`}>
      Paste a 1address instead
    </button>
  )

  if (view.state === 'claiming') {
    return (
      <div className="flex flex-col gap-4">
        <InfoBand pulse="dot">
          BSV Wallet connected. Sending {fmt(payoutSats)} sats on {networkName}…
        </InfoBand>
        <p className="text-center text-xs text-ink-muted">Keep BSV Wallet open until it shows the coins.</p>
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

      <div className="flex items-center gap-3 text-xs font-medium text-ink-muted">
        <span className="h-px flex-1 bg-border" />
        Already have BSV Wallet on your phone?
        <span className="h-px flex-1 bg-border" />
      </div>

      {view.state === 'starting' && <InfoBand>Preparing a phone claim…</InfoBand>}

      {view.state === 'waiting' && claim && (
        <div className="flex flex-col items-center gap-3">
          {onPhone && (
            <a href={claim.pairingUri} data-glow="" className={BTN_CLAIM}>
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
              className="rounded-md border border-border bg-white p-2"
            />
            <span className="text-xs text-ink-muted">
              {onPhone ? 'Or scan from another phone with BSV Wallet' : 'Scan with BSV Wallet to claim'}
            </span>
          </div>
          <p className="w-full text-center text-xs leading-relaxed text-ink-muted">
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
                <button type="button" onClick={() => onTrack(view.txid!)} className={TEXT_LINK}>
                  Track transaction
                </button>
              </>
            )}
          </ErrorBand>
          <button type="button" onClick={start} className={SECONDARY_CTA}>
            Try again
          </button>
        </div>
      )}

      {view.state === 'expired' && (
        <div className="flex flex-col items-start gap-3">
          <ErrorBand>The claim code expired before BSV Wallet connected.</ErrorBand>
          <button type="button" onClick={start} className={SECONDARY_CTA}>
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

  /** Ask a local BRC-100 wallet which network it's on; null when no wallet answers in time. */
  const probe = useCallback(async (): Promise<{ w: WalletClient; net: 'mainnet' | 'testnet' } | null> => {
    // WalletClient('auto') is lazy (safe to construct), but its first call has no built-in
    // connect timeout — so race it.
    const w = new WalletClient('auto')
    const net = await Promise.race([
      w.getNetwork({}).then(({ network }) => network),
      new Promise<null>((r) => setTimeout(() => r(null), DETECT_TIMEOUT_MS)),
    ]).catch(() => null)
    return net ? { w, net } : null
  }, [])

  // On load: resume a mobile claim from earlier in this tab, else detect a local wallet, else go to
  // the no-wallet panel.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (loadPendingClaim()) return setPhase('mobile')
      const found = await probe()
      if (cancelled) return
      if (!found) return setPhase('mobile')
      wallet.current = found.w
      setWalletNetwork(found.net)
      setPhase('idle')
    })()
    return () => {
      cancelled = true
    }
  }, [probe])

  /** After the visitor switches their wallet off mainnet: ask it again. */
  const [rechecking, setRechecking] = useState(false)
  async function recheck() {
    setRechecking(true)
    const found = await probe()
    setRechecking(false)
    if (!found) return
    wallet.current = found.w
    setWalletNetwork(found.net)
  }

  async function claim() {
    const w = wallet.current
    if (!w) return
    const claimNetwork = network
    setPhase('claiming')
    setError('')
    setResult(null)
    try {
      const { publicKey: identityKey } = await w.getPublicKey({ identityKey: true })
      const res = await fetch(withBasePath('/api/claim/wallet'), {
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
        <button type="button" onClick={onUsePaste} className={`self-center text-sm ${TEXT_LINK}`}>
          Paste a 1address instead
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
          Your wallet is on <span className="font-semibold">mainnet</span>. Switch it to {networkName}, then{' '}
          <button type="button" onClick={recheck} disabled={rechecking} className={TEXT_LINK}>
            {rechecking ? 'checking…' : 'check again'}
          </button>
          .
        </WarnBand>
      )}

      {phase === 'idle' && !onMainnet && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
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
              <button type="button" onClick={() => onTrack(result.txid)} className={TEXT_LINK}>
                Track transaction
              </button>
            </>
          )}
        </ErrorBand>
      )}

      {/* TODO: re-enable Turnstile — and restore `!token` in the button's disabled below. */}
      {/* {(phase === 'idle' || phase === 'error') && <TurnstileWidget siteKey={siteKey} onToken={setToken} />} */}

      <button type="button" data-glow="" onClick={claim} disabled={busy || onMainnet} className={BTN_CLAIM}>
        {busy ? <BusyLabel>Claiming…</BusyLabel> : <ClaimLabel payoutSats={payoutSats} networkName={networkName} />}
      </button>

      <p className="text-center text-xs text-ink-muted">Atomic BEEF, spendable on receipt. Nothing to paste.</p>
    </div>
  )
}
