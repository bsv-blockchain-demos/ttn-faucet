'use client'
import { useState } from 'react'
import { WalletPanel } from './WalletClaim'
import { AddressPanel } from './ClaimForm'
import { TxStatusModal } from './TxStatusModal'

type Tab = 'wallet' | 'address'

// Neutral monogram placeholders (B / D / M), ready to swap for real wallet logo assets.
const WALLETS = [
  { name: 'BSV Browser', m: 'B' },
  { name: 'BSV Desktop', m: 'D' },
  { name: 'Metanet', m: 'M' },
]

/** The hero faucet card: brand-native chrome, Wallet / Paste tabs, one claim flow each. */
export function FaucetCard({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
  const [tab, setTab] = useState<Tab>('wallet')
  const [trackTxid, setTrackTxid] = useState<string | null>(null)

  const tabCls = (active: boolean) =>
    `h-[42px] flex-1 rounded-pill text-sm font-semibold transition ${
      active ? 'bg-primary text-primary-foreground shadow-card' : 'text-muted-foreground'
    }`

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-card shadow-card">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-hairline px-6 py-5">
        <div className="leading-tight">
          <div className="font-display text-[17px] font-semibold text-foreground">Teratestnet Coins</div>
          <div className="text-[12.5px] text-muted-foreground">{payoutSats.toLocaleString()} sats per request</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent px-3 py-[5px] text-xs font-medium text-accent-foreground">
          <span className="dotpulse h-[7px] w-[7px] rounded-full bg-pos" />
          Live
        </span>
      </div>

      <div className="px-6 pt-5">
        {/* Segmented tabs */}
        <div className="flex gap-[7px] rounded-pill bg-muted p-[5px]">
          <button type="button" onClick={() => setTab('wallet')} className={tabCls(tab === 'wallet')}>
            Wallet · 1-click
          </button>
          <button type="button" onClick={() => setTab('address')} className={tabCls(tab === 'address')}>
            Paste address
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 pt-[22px]">
        {tab === 'wallet' && (
          <>
            <div className="mb-[22px] grid grid-cols-3 gap-[11px]">
              {WALLETS.map((w) => (
                <div
                  key={w.name}
                  className="lift rounded-[13px] border border-hairline bg-band px-2.5 py-[15px] text-center"
                >
                  <span className="mx-auto mb-[9px] flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent font-display text-[15px] font-semibold text-accent-foreground">
                    {w.m}
                  </span>
                  <span className="text-[12.5px] font-medium text-foreground">{w.name}</span>
                </div>
              ))}
            </div>
            <WalletPanel
              siteKey={siteKey}
              payoutSats={payoutSats}
              onUsePaste={() => setTab('address')}
              onTrack={setTrackTxid}
            />
          </>
        )}

        {tab === 'address' && (
          <AddressPanel siteKey={siteKey} payoutSats={payoutSats} onTrack={setTrackTxid} />
        )}
      </div>

      {trackTxid && <TxStatusModal key={trackTxid} txid={trackTxid} onClose={() => setTrackTxid(null)} />}
    </div>
  )
}
