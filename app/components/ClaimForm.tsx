'use client'
import { useState } from 'react'
import { TurnstileWidget } from './TurnstileWidget'

export function ClaimForm({ siteKey }: { siteKey: string }) {
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ txid: string; ef: string } | null>(null)
  const [error, setError] = useState('')

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

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
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
        {busy ? 'Sending…' : 'Claim test coins'}
      </button>
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
