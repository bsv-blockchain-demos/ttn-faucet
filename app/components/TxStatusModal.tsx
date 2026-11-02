'use client'
import { withBasePath } from '@/lib/base-path'
import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CloseIcon, ExternalIcon } from './icons'
import { NETWORKS, txUrl, type NetworkId } from '@/lib/networks'
import { NetworkIcon } from './NetworkIcon'

type StatusResp = { txid: string; status: string; blockHeight: number | null }

const STEPS = [
  { label: 'Received', sub: 'Faucet accepted the request' },
  { label: 'Broadcast', sub: 'Sent to arcade' },
  { label: 'Accepted', sub: 'In the mempool, spendable now' },
  { label: 'Mined', subPending: 'Awaiting the next block', subDone: 'Confirmed in a block' },
] as const

/** Map arcade tx status -> reached lifecycle level (1..4). */
function reachedLevel(status?: string): number {
  switch ((status ?? '').toUpperCase()) {
    case 'MINED':
      return 4
    case 'ACCEPTED_BY_NETWORK':
    case 'SEEN_ON_NETWORK':
      return 3
    case 'SENT_TO_NETWORK':
      return 2
    case 'RECEIVED':
    default:
      return 1
  }
}

const shortTxid = (t: string) => (t.length > 18 ? `${t.slice(0, 12)}…${t.slice(-6)}` : t)

/** Mounted (keyed by txid) only while open, so initial state is always fresh. */
export function TxStatusModal({ txid, network, onClose }: { txid: string; network: NetworkId; onClose: () => void }) {
  const explorer = txUrl(network, txid)
  const [data, setData] = useState<StatusResp | null>(null)
  const [error, setError] = useState('')
  const loading = !data && !error
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Fetch status on mount. setState happens only in async callbacks (never synchronously
  // in the effect body), and the component is remounted per txid so no reset is needed.
  useEffect(() => {
    let alive = true
    fetch(withBasePath(`/api/status/${txid}?network=${network}`))
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) setError(json.error ?? 'Could not load status')
        else setData(json)
      })
      .catch(() => alive && setError('Could not load status'))
    return () => {
      alive = false
    }
  }, [txid, network])

  // While open: the page behind doesn't scroll, and focus goes back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [])

  // Esc to close + focus the close button on open + simple focus trap.
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (f.length === 0) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [txid, onClose])

  const level = reachedLevel(data?.status)
  const statusLabel = error ? 'Unknown' : loading ? 'Checking…' : STEPS[level - 1].label

  return (
    <div
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-(--scrim) p-6 backdrop-blur-[2px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction status"
        data-network={network}
        className="w-[440px] max-w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-overlay"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="flex items-center gap-2.5">
            <span className="headline-sm text-foreground">Transaction status</span>
            <span className="label-sm inline-flex items-center gap-1.5 rounded-full border border-net-bd bg-net-bg px-2.5 py-1 text-net">
              <NetworkIcon network={network} className="size-3.5" />
              {NETWORKS[network].name}
            </span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* txid + status badge */}
          <div className="mb-5 flex items-center justify-between rounded-md bg-surface px-3.5 py-2.5">
            <span className="font-mono text-xs text-foreground">{shortTxid(txid)}</span>
            {error || loading ? (
              <span className="label-sm inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-ink-muted">
                <span className="size-1.5 rounded-full bg-ink-muted" />
                {statusLabel}
              </span>
            ) : (
              <span className="label-sm inline-flex items-center gap-1.5 rounded-full bg-pos-bg px-2.5 py-1 text-pos">
                <span className="size-1.5 rounded-full bg-pos" />
                {statusLabel}
              </span>
            )}
          </div>

          {error ? (
            <p className="py-4 text-center text-sm text-ink-muted">
              {error === 'Unknown txid' ? 'Transaction not found yet — it may still be propagating.' : error}
            </p>
          ) : (
            <div className="flex flex-col">
              {STEPS.map((step, i) => {
                const stepLevel = i + 1
                const isLast = i === STEPS.length - 1
                const state =
                  stepLevel < level
                    ? 'done'
                    : stepLevel === level
                    ? 'current'
                    : stepLevel === level + 1
                    ? 'next'
                    : 'pending'
                const minedDone = isLast && level === 4
                const sub =
                  'sub' in step
                    ? step.sub
                    : minedDone
                    ? data?.blockHeight
                      ? `Confirmed in block ${data.blockHeight}`
                      : step.subDone
                    : step.subPending
                const reached = stepLevel <= level
                return (
                  <div key={step.label} className="flex gap-[13px]">
                    <div className="flex flex-col items-center">
                      {state === 'done' || state === 'current' ? (
                        <span
                          className="step-dot flex h-[22px] w-[22px] items-center justify-center rounded-full"
                          style={
                            state === 'current'
                              ? {
                                  background: 'var(--primary)',
                                  boxShadow: '0 0 0 4px color-mix(in oklch, var(--primary) 18%, transparent)',
                                }
                              : { background: 'var(--success)' }
                          }
                        >
                          <CheckIcon size={state === 'current' ? 11 : 12} className="text-primary-foreground" />
                        </span>
                      ) : state === 'next' ? (
                        <span
                          className="spin h-[22px] w-[22px] rounded-full border-2 border-border"
                          style={{ borderTopColor: 'var(--primary)' }}
                        />
                      ) : (
                        <span className="h-[22px] w-[22px] rounded-full border border-border" />
                      )}
                      {!isLast && (
                        <span
                          className="w-0.5 flex-1"
                          style={{ minHeight: 18, background: reached ? 'var(--success)' : 'var(--border)' }}
                        />
                      )}
                    </div>
                    <div className={isLast ? '' : 'pb-4'}>
                      <div
                        className={`text-sm font-medium ${reached ? 'text-foreground' : 'text-ink-muted'}`}
                      >
                        {step.label}
                      </div>
                      <div className="text-xs text-ink-muted">{sub}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View on {NETWORKS[network].name} explorer <ExternalIcon size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
