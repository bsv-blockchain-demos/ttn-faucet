'use client'
import { useState } from 'react'
import { CheckIcon, CopyIcon } from './icons'
import { useNetwork } from './NetworkProvider'
import { NETWORK_IDS, type NetworkId } from '@/lib/networks'

/** The example call to this deployment's claim URL, for whichever network is selected in the card. */
const curl = (claimUrl: string, network: NetworkId) => `# claim test coins to an address on ${network}
# (network: ${NETWORK_IDS.join(' | ')}; omit for the faucet's default)
curl -X POST ${claimUrl} \\
  -H 'content-type: application/json' \\
  -d '{"address":"<your-testnet-address>","network":"${network}"}'

# -> 200
{
  "txid": "a1b2…",
  "ef": "0200…",
  "network": "${network}"
}`

/**
 * Syntax colour for the one sample, without a highlighter: one pass of one regular expression, as
 * bsvblockchain.org does for its code panels (components/runar/code-tint.tsx). Shiki or Prism would
 * ship a grammar to colour twelve fixed lines. It isn't a shell parser, and doesn't need to be: the
 * sample is ours. Order matters: comments and strings come first, so nothing inside them is
 * re-tinted.
 */
const TOKENS = new RegExp(
  [
    String.raw`(?<comment>#[^\n]*)`,
    String.raw`(?<key>"[^"\n]*"(?=\s*:))`, // a JSON key: a string followed by a colon
    String.raw`(?<string>'[^'\n]*'|"[^"\n]*")`,
    String.raw`(?<url>https?:\/\/[^\s'"]+)`,
    String.raw`(?<flag>(?<=\s)-{1,2}[A-Za-z][\w-]*)`,
    String.raw`(?<number>\b\d+\b)`,
    String.raw`(?<punct>[{}\[\]:,\\])`,
    String.raw`(?<word>[A-Za-z_][\w-]*)`,
  ].join('|'),
  'g'
)

const COMMANDS = new Set(['curl'])
const METHODS = new Set(['POST', 'GET'])

function tint(groups: Record<string, string | undefined>): string | null {
  if (groups.comment) return 'text-code-dim italic'
  if (groups.key) return 'text-(--code-keyword)'
  if (groups.string) return 'text-(--code-string)'
  if (groups.url) return 'text-(--code-type) underline decoration-white/15 underline-offset-4'
  if (groups.flag) return 'text-(--code-meta)'
  if (groups.number) return 'text-(--code-number)'
  if (groups.punct) return 'text-code-dim'
  if (groups.word && COMMANDS.has(groups.word)) return 'font-medium text-(--code-keyword)'
  if (groups.word && METHODS.has(groups.word)) return 'text-(--code-type)'
  return null
}

/** One line of the sample, split into tinted spans and plain text. */
function Highlighted({ line }: { line: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of line.matchAll(TOKENS)) {
    const cls = tint(m.groups ?? {})
    if (!cls) continue
    if (m.index > last) parts.push(line.slice(last, m.index))
    parts.push(
      <span key={m.index} className={cls}>
        {m[0]}
      </span>
    )
    last = m.index + m[0].length
  }
  if (last < line.length) parts.push(line.slice(last))
  return <>{parts}</>
}

const ENDPOINTS = [
  { method: 'POST', path: '/api/claim' },
  { method: 'POST', path: '/api/claim/wallet' },
  { method: 'GET', path: '/api/status/:txid?network=' },
  { method: 'GET', path: '/api/networks' },
]

export function ApiTerminal({ claimUrl }: { claimUrl: string }) {
  const { network } = useNetwork()
  const CURL = curl(claimUrl, network)
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard?.writeText(CURL)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {ENDPOINTS.map((e) => (
          <span
            key={e.path}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 font-mono text-xs text-foreground shadow-raised dark:shadow-none"
          >
            <span className={`font-medium ${e.method === 'POST' ? 'text-pos' : 'text-primary'}`}>{e.method}</span>
            {e.path}
          </span>
        ))}
      </div>

      {/* The site's quickstart terminal: deep navy panel, white/10 hairline, copy button top right. */}
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-code-bg">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          {/* Window furniture, kept neutral: no amber on the page. */}
          <span aria-hidden className="size-3 rounded-full bg-white/20" />
          <span aria-hidden className="size-3 rounded-full bg-white/20" />
          <span aria-hidden className="size-3 rounded-full bg-white/20" />
          <span className="ms-2 font-mono text-xs text-code-dim">claim.sh</span>
          <button
            type="button"
            onClick={copy}
            className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-white/20 px-3 text-xs font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="scrollbar-faint overflow-x-auto p-6 font-mono text-sm leading-[1.7] text-code-fg">
          {CURL.split('\n').map((line, i) => (
            <span key={i} className="block min-h-[1lh]">
              <Highlighted line={line} />
            </span>
          ))}
        </pre>
      </div>

      <p className="text-sm text-ink-muted">
        Drop an <code className="font-mono text-foreground">Authorization: Bearer &lt;key&gt;</code> header for higher
        limits and no captcha.
      </p>
    </div>
  )
}
