'use client'
import { useState } from 'react'
import { TurnstileWidget } from './TurnstileWidget'
import { generateTestnetKey } from '@/lib/keygen'
import { ArrowRightIcon, CheckIcon, CopyIcon, WarningIcon } from './icons'

const fmt = (n: number) => n.toLocaleString()
const tbsv = (n: number) => (n / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })

const PRIMARY_CTA =
  'shine flex h-[52px] w-full items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-semibold text-primary-foreground shadow-primary disabled:cursor-not-allowed disabled:opacity-60'

/** A labelled, single-line copyable field (truncates; full value copied on click). */
function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-accent-foreground/70">{label}</div>
      <button
        type="button"
        onClick={onCopy}
        title={`Copy ${label}`}
        className="flex w-full items-center gap-2 rounded-lg border border-hairline bg-card px-3 py-2 text-left transition hover:border-[color:var(--btn2-bd)]"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{value}</span>
        <span className="ml-auto flex flex-none items-center gap-1">
          {copied ? (
            <>
              <CheckIcon size={12} className="text-pos" />
              <span className="text-[11px] font-medium text-pos">Copied</span>
            </>
          ) : (
            <CopyIcon size={13} className="text-link" />
          )}
        </span>
      </button>
    </div>
  )
}

/** Paste-address tab of the faucet card — claim to any Teratestnet address, returns the EF. */
export function AddressPanel({
  siteKey,
  payoutSats,
  onTrack,
}: {
  siteKey: string
  payoutSats: number
  onTrack: (txid: string) => void
}) {
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ txid: string; ef: string } | null>(null)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState<{ wif: string; address: string } | null>(null)
  const [copied, setCopied] = useState<'addr' | 'wif' | ''>('')

  function generate() {
    const g = generateTestnetKey()
    setGenerated(g)
    setAddress(g.address) // auto-fill the claim field
  }

  function copy(text: string, which: 'addr' | 'wif') {
    void navigator.clipboard?.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(''), 1500)
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[13.5px] font-medium text-foreground">Your Teratestnet address</span>
          <button type="button" onClick={generate} className="text-[13px] font-semibold text-link">
            Generate a test key
          </button>
        </div>
        <input
          className="field h-[50px] w-full rounded-input border-[1.5px] border-input-border bg-card px-[15px] font-mono text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="m… or n…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </div>

      {generated && (
        <div className="rounded-input bg-accent p-4">
          <div className="flex flex-col gap-2.5">
            <CopyRow
              label="Address (auto-filled above)"
              value={generated.address}
              copied={copied === 'addr'}
              onCopy={() => copy(generated.address, 'addr')}
            />
            <CopyRow
              label="Private key (WIF)"
              value={generated.wif}
              copied={copied === 'wif'}
              onCopy={() => copy(generated.wif, 'wif')}
            />
          </div>
          <div className="mt-3 flex items-start gap-2">
            <WarningIcon size={14} style={{ color: 'var(--warn-icon)', flex: 'none', marginTop: 1 }} />
            <span className="text-[11.5px] leading-snug text-accent-foreground">
              Testing only. Save the WIF to spend these coins elsewhere; never use it for real funds.
            </span>
          </div>
        </div>
      )}

      <TurnstileWidget siteKey={siteKey} onToken={setToken} />

      <button type="submit" disabled={busy || !token || !address} className={PRIMARY_CTA}>
        {busy ? 'Sending…' : `Claim ${fmt(payoutSats)} sats`}
      </button>

      {error && <p className="text-center text-sm font-medium text-neg">{error}</p>}

      {result && (
        <div className="rounded-[14px] border border-pos bg-pos-bg p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-pos">
              <CheckIcon size={15} className="text-primary-foreground" />
            </span>
            <span className="font-display text-[15px] font-semibold text-foreground">Funds sent</span>
            <button
              type="button"
              onClick={() => onTrack(result.txid)}
              className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-link"
            >
              Track <ArrowRightIcon size={13} />
            </button>
          </div>
          <div className="mb-[5px] text-[11px] font-medium text-muted-foreground">Extended format (EF)</div>
          <div className="scrollbar-faint max-h-16 overflow-auto break-all rounded-lg border border-hairline bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {result.ef}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Each claim sends {fmt(payoutSats)} sats (~{tbsv(payoutSats)} tBSV) in extended format.
      </p>
    </form>
  )
}
