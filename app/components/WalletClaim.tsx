'use client'
import { useEffect, useRef, useState } from 'react'
import { WalletClient, Utils } from '@bsv/sdk'
import { TurnstileWidget } from './TurnstileWidget'

type Phase = 'detecting' | 'unavailable' | 'idle' | 'claiming' | 'success' | 'error'

/** Wallet tab of the faucet card — one-click BRC-100 claim, internalized as Atomic BEEF. */
export function WalletPanel({
  siteKey,
  payoutSats,
  onUsePaste,
}: {
  siteKey: string
  payoutSats: number
  onUsePaste: () => void
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
            setNetworkWarning('Your wallet is on mainnet — these are teratestnet coins and may not appear.')
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

  if (phase === 'detecting') {
    return (
      <div className="flex items-center gap-3 py-6 text-sm text-white/50">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
        Looking for a BRC-100 wallet…
      </div>
    )
  }

  if (phase === 'unavailable') {
    return (
      <div className="flex flex-col gap-3 py-4">
        <p className="text-sm text-white/60">
          No BRC-100 wallet detected. Install a wallet like BSV Browser, BSV Desktop, or Metanet —
          or paste an address instead.
        </p>
        <button
          type="button"
          onClick={onUsePaste}
          className="self-start rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Paste an address instead →
        </button>
      </div>
    )
  }

  const tbsv = (payoutSats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })
  const busy = phase === 'claiming'

  if (phase === 'success' && result) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <div className="flex items-center gap-2 text-accent-400">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-500/15 text-sm">✓</span>
          <p className="font-semibold">Funds in your wallet!</p>
        </div>
        <p className="text-sm text-white/60">
          {result.amount.toLocaleString()} sats are now spendable — no confirmation needed.
        </p>
        <a
          href={`/api/status/${result.txid}`}
          className="break-all rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-brand-400 hover:text-brand-400/80"
        >
          txid: {result.txid}
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-white/60">
        Connect a BRC-100 wallet and we&apos;ll pay a BRC-29 output straight to your identity key —
        internalized as Atomic BEEF, <span className="text-white">spendable instantly</span>.
      </p>

      {networkWarning && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
          ⚠ {networkWarning}
        </p>
      )}

      <TurnstileWidget siteKey={siteKey} onToken={setToken} />

      <button
        type="button"
        onClick={claim}
        disabled={busy || !token}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 font-medium text-white shadow-[0_8px_30px_rgba(79,107,255,0.35)] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {busy ? 'Connecting…' : `Connect wallet & claim ${payoutSats.toLocaleString()} sats`}
        {!busy && <span aria-hidden>→</span>}
      </button>

      {phase === 'error' && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-center text-xs text-white/35">
        No address to type · no key to paste · ~{tbsv} tBSV
      </p>
    </div>
  )
}
