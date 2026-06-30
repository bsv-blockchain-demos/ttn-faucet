'use client'
import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CloseIcon, ExternalIcon } from './icons'

// NOTE: no public Teratestnet explorer URL is known yet — placeholder to confirm.
const EXPLORER = '#'

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
export function TxStatusModal({ txid, onClose }: { txid: string; onClose: () => void }) {
  const [data, setData] = useState<StatusResp | null>(null)
  const [error, setError] = useState('')
  const loading = !data && !error
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Fetch status on mount. setState happens only in async callbacks (never synchronously
  // in the effect body), and the component is remounted per txid so no reset is needed.
  useEffect(() => {
    let alive = true
    fetch(`/api/status/${txid}`)
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
  }, [txid])

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
      className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-[2px]"
      style={{ background: 'var(--scrim)' }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction status"
        className="w-[440px] max-w-[90%] overflow-hidden rounded-card border border-hairline bg-card shadow-card"
      >
        <div className="flex items-center justify-between border-b border-hairline px-[22px] py-[18px]">
          <span className="font-display text-base font-semibold text-foreground">Transaction status</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-hairline text-muted-foreground transition hover:bg-band"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="px-[22px] py-5">
          {/* txid + status pill */}
          <div className="mb-[18px] flex items-center justify-between rounded-[10px] bg-muted px-[14px] py-[11px]">
            <span className="font-mono text-xs text-foreground">{shortTxid(txid)}</span>
            {error || loading ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <span className="h-[7px] w-[7px] rounded-full bg-[color:var(--muted-fg)]" />
                {statusLabel}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-pos-bg px-2.5 py-1 text-xs font-medium text-pos">
                <span className="h-[7px] w-[7px] rounded-full bg-pos" />
                {statusLabel}
              </span>
            )}
          </div>

          {error ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
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
                              ? { background: 'var(--primary)', boxShadow: '0 0 0 4px var(--accent)' }
                              : { background: 'var(--pos)' }
                          }
                        >
                          <CheckIcon size={state === 'current' ? 11 : 12} className="text-primary-foreground" />
                        </span>
                      ) : state === 'next' ? (
                        <span
                          className="spin h-[22px] w-[22px] rounded-full border-2 border-hairline"
                          style={{ borderTopColor: 'var(--muted-fg)' }}
                        />
                      ) : (
                        <span className="h-[22px] w-[22px] rounded-full border border-hairline" />
                      )}
                      {!isLast && (
                        <span
                          className="w-0.5 flex-1"
                          style={{ minHeight: 18, background: reached ? 'var(--pos)' : 'var(--hairline)' }}
                        />
                      )}
                    </div>
                    <div className={isLast ? '' : 'pb-4'}>
                      <div
                        className={`text-sm font-semibold ${reached ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {step.label}
                      </div>
                      <div className="text-xs text-muted-foreground">{sub}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <a
            href={EXPLORER}
            className="mt-[18px] inline-flex items-center gap-1.5 text-[13px] font-semibold text-link"
          >
            View on explorer <ExternalIcon size={14} />
          </a>
        </div>
      </div>
    </div>
  )
}
