'use client'
import { useState } from 'react'
import { TurnstileWidget } from './TurnstileWidget'
import { generateTestnetKey } from '@/lib/keygen'

export function ClaimForm({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
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
      <div className="rounded border border-dashed border-gray-300 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-600">No address yet?</span>
          <button
            type="button"
            onClick={generate}
            className="rounded border border-gray-300 px-3 py-1 text-sm font-medium hover:bg-gray-50"
          >
            Generate a test key
          </button>
        </div>
        {generated && (
          <div className="mt-3 flex flex-col gap-2 text-xs">
            <div>
              <div className="text-gray-500">Address (auto-filled below)</div>
              <button type="button" onClick={() => copy(generated.address)} className="break-all text-left font-mono text-gray-900 underline decoration-dotted" title="Copy">
                {generated.address}
              </button>
            </div>
            <div>
              <div className="text-gray-500">Private key (WIF)</div>
              <button type="button" onClick={() => copy(generated.wif)} className="break-all text-left font-mono text-gray-900 underline decoration-dotted" title="Copy">
                {generated.wif}
              </button>
            </div>
            <p className="text-amber-700">
              ⚠ Testing only — save the WIF to spend these coins elsewhere. Never use it for real funds.
            </p>
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Your teratestnet address</span>
        <input
          className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          placeholder="m… or n…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </label>

      <TurnstileWidget siteKey={siteKey} onToken={setToken} />

      <button
        type="submit"
        disabled={busy || !token || !address}
        className="rounded bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Sending…' : `Claim ${payoutSats.toLocaleString()} sats`}
      </button>
      <p className="text-xs text-gray-500">Each claim sends {payoutSats.toLocaleString()} sats (~{tbsv} tBSV).</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded bg-gray-50 p-3 text-sm">
          <p className="font-medium text-emerald-700">Funds sent!</p>
          <p className="mt-1 break-all">
            txid: <a className="text-blue-600 underline" href={`/api/status/${result.txid}`}>{result.txid}</a>
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">Extended-format transaction (EF)</summary>
            <textarea readOnly className="mt-1 h-32 w-full font-mono text-xs" value={result.ef} />
          </details>
        </div>
      )}
    </form>
  )
}
