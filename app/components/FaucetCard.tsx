'use client'
import { useState } from 'react'
import { WalletPanel } from './WalletClaim'
import { AddressPanel } from './ClaimForm'
import { TxStatusModal } from './TxStatusModal'

type Tab = 'wallet' | 'address'

/** The hero faucet card: brand-native chrome, Wallet / Paste tabs, one claim flow each. */
export function FaucetCard({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
  const [tab, setTab] = useState<Tab>('wallet')
  const [trackTxid, setTrackTxid] = useState<string | null>(null)

  const tabCls = (active: boolean) =>
    `flex h-[42px] flex-1 items-center justify-center rounded-pill px-2 text-center text-[13px] font-semibold leading-tight transition ${
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
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-pos-bg px-3 py-[5px] text-xs font-medium text-pos">
          <span className="dotpulse h-[7px] w-[7px] rounded-full bg-pos" />
          Live
        </span>
      </div>

      <div className="px-6 pt-5">
        {/* Segmented tabs */}
        <div className="flex gap-[7px] rounded-pill bg-muted p-[5px]">
          <button type="button" onClick={() => setTab('wallet')} className={tabCls(tab === 'wallet')}>
            Auto: BRC-100 Wallet
          </button>
          <button type="button" onClick={() => setTab('address')} className={tabCls(tab === 'address')}>
            Manual: Paste address
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 pt-[22px]">
        {tab === 'wallet' && (
          <WalletPanel
            siteKey={siteKey}
            payoutSats={payoutSats}
            onUsePaste={() => setTab('address')}
            onTrack={setTrackTxid}
          />
        )}

        {tab === 'address' && (
          <AddressPanel siteKey={siteKey} payoutSats={payoutSats} onTrack={setTrackTxid} />
        )}
      </div>

      {trackTxid && <TxStatusModal key={trackTxid} txid={trackTxid} onClose={() => setTrackTxid(null)} />}
    </div>
  )
}
