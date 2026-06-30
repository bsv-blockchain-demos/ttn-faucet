'use client'
import { useEffect, useRef, useState } from 'react'
import { WalletClient, Utils } from '@bsv/sdk'
import { TurnstileWidget } from './TurnstileWidget'
import { ArrowRightIcon, CheckIcon, WarningIcon } from './icons'

type Phase = 'detecting' | 'unavailable' | 'idle' | 'claiming' | 'success' | 'error'
type StepState = 'done' | 'active' | 'todo' | 'error'

const fmt = (n: number) => n.toLocaleString()
const tbsv = (n: number) => (n / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })

const STEP_LABELS = ['Detect', 'Authorize', 'Fund', 'Spendable'] as const
const STEP_MAP: Record<Phase, StepState[]> = {
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

const PRIMARY_CTA =
  'shine flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-semibold text-primary-foreground shadow-primary disabled:cursor-not-allowed disabled:opacity-60'
const SECONDARY_CTA =
  'inline-flex h-11 w-full items-center justify-center rounded-pill border-[1.5px] border-[color:var(--btn2-bd)] bg-transparent px-[22px] text-sm font-semibold text-[color:var(--btn2-fg)] transition min-[620px]:w-auto'

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

  // Detect a BRC-100 wallet on load. WalletClient('auto') is lazy (safe to construct), but its
  // first call has no built-in connect timeout — so probe getVersion() inside a Promise.race.
  useEffect(() => {
    let cancelled = false
    const w = new WalletClient('auto')
    wallet.current = w
    ;(async () => {
      const detected = await Promise.race([
        w.getVersion().then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 1500)),
      ]).catch(() => false)
      if (cancelled) return
      if (!detected) {
        setPhase('unavailable')
        return
      }
      setPhase('idle')
      // A teratestnet wallet reports 'testnet'; only 'mainnet' is a real mismatch worth flagging.
      w.getNetwork()
        .then(({ network }) => {
          if (!cancelled && network === 'mainnet') {
            setNetworkWarning('Your wallet is on mainnet. These are Teratestnet coins and may not appear.')
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
      setResult({ txid: json.txid, amount: json.amount })
      setPhase('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setPhase('error')
    }
  }

  const busy = phase === 'claiming'

  return (
    <div>
      <Stepper phase={phase} />

      {phase === 'detecting' && (
        <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
          <span className="dotpulse h-2 w-2 rounded-full bg-primary" />
          Looking for a BRC-100 wallet…
        </div>
      )}

      {phase === 'unavailable' && (
        <div className="text-center">
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            No BRC-100 wallet detected. Install BSV Browser, BSV Desktop, or Metanet. Or paste an
            address instead.
          </p>
          <button type="button" onClick={onUsePaste} className={`${SECONDARY_CTA} hover:bg-band`}>
            Paste an address instead
          </button>
        </div>
      )}

      {(phase === 'idle' || phase === 'claiming' || phase === 'error') && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Connect a BRC-100 wallet and we&apos;ll pay a BRC-29 output straight to your identity key,
            internalized as Atomic BEEF and{' '}
            <span className="font-semibold text-foreground">spendable instantly</span>.
          </p>

          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Need a wallet? Download{' '}
            <a
              href="https://desktop.bsvb.tech/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-link"
            >
              BSV Desktop
            </a>{' '}
            or{' '}
            <a
              href="https://mobile.bsvb.tech/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-link"
            >
              BSV Browser
            </a>{' '}
            for mobile.
          </p>

          {networkWarning && phase !== 'claiming' && (
            <div
              className="flex items-start gap-2.5 rounded-input p-3"
              style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}
            >
              <WarningIcon size={16} style={{ color: 'var(--warn-icon)', flex: 'none', marginTop: 1 }} />
              <span className="text-[13px] leading-snug text-foreground">{networkWarning}</span>
            </div>
          )}

          {(phase === 'idle' || phase === 'error') && <TurnstileWidget siteKey={siteKey} onToken={setToken} />}

          <button
            type="button"
            onClick={claim}
            disabled={busy || !token}
            className={`${PRIMARY_CTA} shine-loop`}
          >
            {busy ? 'Connecting…' : `Connect wallet & claim ${fmt(payoutSats)} sats`}
            {!busy && <ArrowRightIcon size={18} />}
          </button>

          {phase === 'error' && <p className="text-sm font-medium text-neg">{error}</p>}

          <p className="text-center text-xs text-muted-foreground">
            No address to type, no key to paste, ~{tbsv(payoutSats)} tBSV
          </p>
        </div>
      )}

      {phase === 'success' && result && (
        <div className="rounded-[14px] border border-pos bg-pos-bg p-[18px] text-center">
          <div className="mx-auto mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-pos">
            <CheckIcon size={24} className="text-primary-foreground" />
          </div>
          <div className="mb-1 font-display text-lg font-semibold text-foreground">Funds in your wallet</div>
          <div className="mb-[14px] text-[13.5px] leading-relaxed text-muted-foreground">
            {fmt(result.amount)} sats are now spendable. No confirmation needed.
          </div>
          <button type="button" onClick={() => onTrack(result.txid)} className={`${SECONDARY_CTA} hover:bg-band`}>
            Track transaction
          </button>
        </div>
      )}
    </div>
  )
}
