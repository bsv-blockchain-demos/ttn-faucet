'use client'
import { useState } from 'react'
import { CopyIcon } from './icons'

const CURL = `# claim test coins to an address
curl -X POST https://faucet.teratestnet.org/api/claim \\
  -H 'content-type: application/json' \\
  -d '{"address":"<your-teratestnet-address>","captchaToken":"<turnstile>"}'

# -> 200
{
  "txid": "a1b2…",
  "ef": "0200…",
  "network": "teratestnet"
}`

const ENDPOINTS = [
  { method: 'POST', path: '/api/claim' },
  { method: 'POST', path: '/api/claim/wallet' },
  { method: 'GET', path: '/api/status/:txid' },
]

export function ApiTerminal() {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard?.writeText(CURL)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-[9px]">
        {ENDPOINTS.map((e) => (
          <span
            key={e.path}
            className="inline-flex items-center gap-2 rounded-lg border border-hairline px-[11px] py-1.5 font-mono text-xs font-medium text-foreground"
          >
            <span className={e.method === 'POST' ? 'text-pos' : 'text-link'}>{e.method}</span>
            {e.path}
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-panel bg-code-bg" style={{ border: '1px solid var(--code-bd)' }}>
        <div
          className="flex items-center justify-between px-4 py-[11px]"
          style={{ borderBottom: '1px solid var(--code-bd-soft)' }}
        >
          <span className="flex items-center gap-[7px]">
            <span className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--tl-red)' }} />
            <span className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--tl-amber)' }} />
            <span className="h-[11px] w-[11px] rounded-full" style={{ background: 'var(--tl-green)' }} />
            <span className="ml-1.5 font-mono text-xs text-code-dim">claim.sh</span>
          </span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-code-link transition hover:opacity-80"
          >
            <CopyIcon size={13} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="scrollbar-faint overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.7] text-code-fg">
          {CURL}
        </pre>
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        Drop an <code className="font-mono text-foreground">Authorization: Bearer &lt;key&gt;</code> header for
        higher limits and no captcha.
      </p>
    </div>
  )
}
