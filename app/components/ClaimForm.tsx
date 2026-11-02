'use client'
import { withBasePath } from '@/lib/base-path'
import { useEffect, useState } from 'react'
// TODO: re-enable Turnstile — temporarily disabled.
// import { TurnstileWidget } from './TurnstileWidget'
import { generateTestnetKey } from '@/lib/keygen'
import { ArrowRightIcon, CheckIcon, CopyIcon, WarningIcon } from './icons'
import { useNetwork } from './NetworkProvider'
import { BusyLabel, ClaimLabel } from './ClaimLabel'
import { BTN_CLAIM } from './buttons'
import { NETWORKS } from '@/lib/networks'

const fmt = (n: number) => n.toLocaleString()
const tbsv = (n: number) => (n / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })

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
      <div className="mb-1 text-xs font-medium text-ink-muted">{label}</div>
      <button
        type="button"
        onClick={onCopy}
        title={`Copy ${label}`}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-left transition-colors hover:border-primary-edge"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{value}</span>
        <span className="ml-auto flex flex-none items-center gap-1">
          {copied ? (
            <>
              <CheckIcon size={12} className="text-pos" />
              <span className="text-xs font-medium text-pos">Copied</span>
            </>
          ) : (
            <CopyIcon size={14} className="text-primary" />
          )}
        </span>
      </button>
    </div>
  )
}

/**
 * Paste-address tab of the faucet card — claim to a testnet address on the selected network,
 * returns the EF. Every test network shares the address format, so the network comes from the
 * picker, not the address.
 */
export function AddressPanel({
  siteKey,
  payoutSats,
  onTrack,
  onBusy,
}: {
  siteKey: string
  payoutSats: number
  onTrack: (txid: string) => void
  onBusy: (busy: boolean) => void
}) {
  const { network } = useNetwork()
  const networkName = NETWORKS[network].name
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ txid: string; ef: string } | null>(null)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState<{ wif: string; address: string } | null>(null)
  const [copied, setCopied] = useState<'addr' | 'wif' | 'ef' | ''>('')

  useEffect(() => onBusy(busy), [busy, onBusy])
  // A result belongs to the network it was claimed on; clear it when the network changes.
  const [resultNetwork, setResultNetwork] = useState(network)
  if (resultNetwork !== network) {
    setResultNetwork(network)
    setResult(null)
    setError('')
  }

  function generate() {
    const g = generateTestnetKey()
    setGenerated(g)
    setAddress(g.address) // auto-fill the claim field
  }

  function copy(text: string, which: 'addr' | 'wif' | 'ef') {
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
      const res = await fetch(withBasePath('/api/claim'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, network, captchaToken: token }),
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
          <label htmlFor="claim-address" className="text-sm font-medium text-foreground">
            Your {networkName} address
          </label>
          <button
            type="button"
            onClick={generate}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Generate a test key
          </button>
        </div>
        <input
          className="field h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground placeholder:text-ink-muted"
          id="claim-address"
          placeholder="m… or n…"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </div>

      {generated && (
        <div className="rounded-md border border-border bg-surface p-4">
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
            <WarningIcon size={14} className="mt-px flex-none text-primary" />
            <span className="text-xs leading-snug text-ink-muted">
              Testing only. Save the WIF to spend these coins elsewhere; never use it for real funds.
            </span>
          </div>
        </div>
      )}

      {/* TODO: re-enable Turnstile — and restore `!token` in the button's disabled below. */}
      {/* <TurnstileWidget siteKey={siteKey} onToken={setToken} /> */}

      <button type="submit" data-glow="" disabled={busy || !address} className={BTN_CLAIM}>
        {busy ? <BusyLabel>Sending…</BusyLabel> : <ClaimLabel verb="Send" payoutSats={payoutSats} networkName={networkName} />}
      </button>

      {error && (
        <p role="alert" className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div role="status" className="rounded-md border border-pos/40 bg-pos-bg p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-pos">
              <CheckIcon size={14} weight="bold" className="text-primary-foreground" />
            </span>
            <span className="headline-sm text-foreground">Sent on {networkName}</span>
            <button
              type="button"
              onClick={() => onTrack(result.txid)}
              className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              Track <ArrowRightIcon size={13} />
            </button>
          </div>
          <div className="mb-[5px] flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted">Extended format (EF)</span>
            <button
              type="button"
              onClick={() => copy(result.ef, 'ef')}
              title="Copy EF"
              className="inline-flex flex-none items-center gap-1 text-xs font-medium text-primary"
            >
              {copied === 'ef' ? (
                <>
                  <CheckIcon size={12} className="text-pos" />
                  <span className="text-pos">Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon size={12} />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="break-all rounded-md border border-border bg-surface-raised p-3 font-mono text-xs leading-relaxed text-ink-muted">
            {result.ef}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-ink-muted">
        {fmt(payoutSats)} sat (~{tbsv(payoutSats)} tBSV), returned in extended format
      </p>
    </form>
  )
}
