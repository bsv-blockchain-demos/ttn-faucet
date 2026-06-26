'use client'
import { useState } from 'react'

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {ENDPOINTS.map((e) => (
          <span
            key={e.path}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs"
          >
            <span
              className={`font-semibold ${e.method === 'POST' ? 'text-accent-400' : 'text-brand-400'}`}
            >
              {e.method}
            </span>
            <span className="text-white/70">{e.path}</span>
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080b15] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
            <span className="ml-3 font-mono text-xs text-white/40">claim.sh</span>
          </span>
          <button
            type="button"
            onClick={copy}
            className="rounded-md px-2 py-1 font-mono text-xs text-white/50 transition hover:bg-white/5 hover:text-white"
          >
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
        </div>
        <pre className="scrollbar-faint overflow-x-auto p-4 font-mono text-xs leading-relaxed text-white/80">
          {CURL}
        </pre>
      </div>

      <p className="text-xs text-white/40">
        Drop an <code className="font-mono text-white/60">Authorization: Bearer &lt;key&gt;</code> header for
        higher limits and no captcha.
      </p>
    </div>
  )
}
