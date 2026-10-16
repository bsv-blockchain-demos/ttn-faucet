'use client'
import { useState } from 'react'
import { CopyIcon } from './icons'
import { useNetwork } from './NetworkProvider'
import { NETWORK_IDS, type NetworkId } from '@/lib/networks'

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://faucet.bsvblockchain.tech'

/** The example call, for whichever network is selected in the card. */
const curl = (network: NetworkId) => `# claim test coins to an address on ${network}
# (network: ${NETWORK_IDS.join(' | ')}; omit for the faucet's default)
curl -X POST ${ORIGIN}/api/claim \\
  -H 'content-type: application/json' \\
  -d '{"address":"<your-testnet-address>","network":"${network}"}'

# -> 200
{
  "txid": "a1b2…",
  "ef": "0200…",
  "network": "${network}"
}`

const ENDPOINTS = [
  { method: 'POST', path: '/api/claim' },
  { method: 'POST', path: '/api/claim/wallet' },
  { method: 'GET', path: '/api/status/:txid?network=' },
  { method: 'GET', path: '/api/networks' },
]

export function ApiTerminal() {
  const { network } = useNetwork()
  const CURL = curl(network)
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
            className="inline-flex items-center gap-2 rounded-input border border-hairline px-[11px] py-1.5 font-mono text-xs font-medium text-foreground"
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
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-code-dim">claim.sh</span>
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
