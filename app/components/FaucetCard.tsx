'use client'
import { useState } from 'react'
import { WalletPanel } from './WalletClaim'
import { AddressPanel } from './ClaimForm'

type Tab = 'wallet' | 'address'

const WALLETS = [
  { name: 'BSV Browser', icon: '🔥' },
  { name: 'BSV Desktop', icon: '🖥️' },
  { name: 'Metanet', icon: '🪐' },
]

/** The hero faucet card: terminal-style chrome, Wallet / Paste-address tabs, one claim flow each. */
export function FaucetCard({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
  const [tab, setTab] = useState<Tab>('wallet')

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface/90 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-sm text-white/70">
          <span className="h-2 w-2 rounded-full bg-accent-400 shadow-[0_0_8px_var(--color-accent-400)]" />
          faucet.teratestnet
        </span>
        <span className="rounded-full border border-brand-500/40 bg-brand-500/10 px-2.5 py-0.5 font-mono text-xs text-brand-400">
          v1 · live
        </span>
      </div>

      <div className="p-5 sm:p-6">
        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setTab('wallet')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'wallet' ? 'bg-brand-500 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Wallet · 1-click
          </button>
          <button
            type="button"
            onClick={() => setTab('address')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'address' ? 'bg-brand-500 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Paste address
          </button>
        </div>

        {tab === 'wallet' && (
          <div className="mt-5">
            <div className="grid grid-cols-3 gap-2">
              {WALLETS.map((w) => (
                <div
                  key={w.name}
                  className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center"
                >
                  <span className="text-lg" aria-hidden>
                    {w.icon}
                  </span>
                  <span className="text-xs text-white/60">{w.name}</span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <WalletPanel siteKey={siteKey} payoutSats={payoutSats} onUsePaste={() => setTab('address')} />
            </div>
          </div>
        )}

        {tab === 'address' && (
          <div className="mt-5">
            <AddressPanel siteKey={siteKey} payoutSats={payoutSats} />
          </div>
        )}
      </div>
    </div>
  )
}
