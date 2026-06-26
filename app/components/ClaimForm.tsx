'use client'
import { useState } from 'react'
import { TurnstileWidget } from './TurnstileWidget'
import { generateTestnetKey } from '@/lib/keygen'

/** Paste-address tab of the faucet card — claim to any teratestnet address, returns the EF. */
export function AddressPanel({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ txid: string; ef: string } | null>(null)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState<{ wif: string; address: string } | null>(null)

  function generate() {
    const g = generateTestnetKey()
    setGenerated(g)
    setAddress(g.address) // auto-fill the claim field
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, captchaToken: token }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      setResult({ txid: json.txid, ef: json.ef })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const tbsv = (payoutSats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-sm font-medium text-white/80">
          Your teratestnet address
          <button
            type="button"
            onClick={generate}
            className="text-xs font-normal text-brand-400 hover:text-brand-400/80"
          >
            Generate a test key
          </button>
        </span>
        <input
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-sm text-white placeholder-white/25 transition focus:border-brand-500 focus:outline-none"
          placeholder="m… or n…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </label>

      {generated && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-white/15 bg-black/20 p-3 text-xs">
          <div>
            <div className="text-white/40">Address (auto-filled above)</div>
            <button
              type="button"
              onClick={() => copy(generated.address)}
              className="break-all text-left font-mono text-white underline decoration-dotted underline-offset-2"
              title="Copy"
            >
              {generated.address}
            </button>
          </div>
          <div>
            <div className="text-white/40">Private key (WIF)</div>
            <button
              type="button"
              onClick={() => copy(generated.wif)}
              className="break-all text-left font-mono text-white underline decoration-dotted underline-offset-2"
              title="Copy"
            >
              {generated.wif}
            </button>
          </div>
          <p className="text-amber-300/90">
            ⚠ Testing only — save the WIF to spend these coins elsewhere. Never use it for real funds.
          </p>
        </div>
      )}

      <TurnstileWidget siteKey={siteKey} onToken={setToken} />

      <button
        type="submit"
        disabled={busy || !token || !address}
        className="flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 font-medium text-white shadow-[0_8px_30px_rgba(79,107,255,0.35)] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {busy ? 'Sending…' : `Claim ${payoutSats.toLocaleString()} sats`}
      </button>
      <p className="text-center text-xs text-white/35">
        Each claim sends {payoutSats.toLocaleString()} sats (~{tbsv} tBSV) in extended format.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
          <p className="font-semibold text-accent-400">Funds sent!</p>
          <a href={`/api/status/${result.txid}`} className="break-all font-mono text-xs text-brand-400 hover:text-brand-400/80">
            txid: {result.txid}
          </a>
          <details className="mt-1">
            <summary className="cursor-pointer text-white/60">Extended-format transaction (EF)</summary>
            <textarea
              readOnly
              className="scrollbar-faint mt-2 h-32 w-full rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-xs text-white/70"
              value={result.ef}
            />
          </details>
        </div>
      )}
    </form>
  )
}
