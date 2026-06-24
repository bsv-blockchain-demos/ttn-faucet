'use client'
import { useEffect, useRef, useState } from 'react'
import { WalletClient, Utils } from '@bsv/sdk'
import { TurnstileWidget } from './TurnstileWidget'

type Phase = 'detecting' | 'unavailable' | 'idle' | 'claiming' | 'success' | 'error'

export function WalletClaim({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
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

  if (phase === 'detecting' || phase === 'unavailable') return null

  const tbsv = (payoutSats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })
  const busy = phase === 'claiming'

  return (
    <section className="rounded-lg border-2 border-emerald-500 bg-emerald-50/40 p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Send to my wallet</h2>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
          BRC-100 wallet detected
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Claim {payoutSats.toLocaleString()} sats (~{tbsv} tBSV) straight into your connected wallet — no key or
        address needed.
      </p>

      {networkWarning && <p className="mt-3 text-sm text-amber-700">⚠ {networkWarning}</p>}

      {phase !== 'success' && (
        <div className="mt-4 flex flex-col gap-4">
          <TurnstileWidget siteKey={siteKey} onToken={setToken} />
          <button
            type="button"
            onClick={claim}
            disabled={busy || !token}
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Claiming…' : 'Claim to my wallet'}
          </button>
        </div>
      )}

      {phase === 'error' && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {phase === 'success' && result && (
        <div className="mt-4 rounded bg-white p-3 text-sm">
          <p className="font-medium text-emerald-700">Funds in your wallet!</p>
          <p className="mt-1 text-gray-600">{result.amount.toLocaleString()} sats are now spendable.</p>
          <p className="mt-1 break-all">
            txid: <a className="text-blue-600 underline" href={`/api/status/${result.txid}`}>{result.txid}</a>
          </p>
        </div>
      )}
    </section>
  )
}
