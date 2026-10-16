'use client'
import { useState } from 'react'
import { WalletPanel } from './WalletClaim'
import { AddressPanel } from './ClaimForm'
import { TxStatusModal } from './TxStatusModal'
import { NetworkPicker } from './NetworkPicker'
import { useNetwork } from './NetworkProvider'
import type { NetworkId } from '@/lib/networks'

type Tab = 'wallet' | 'address'

/**
 * The faucet card: pick a network, then claim with a BRC-100 wallet (default) or to an address.
 * The whole card carries data-network + .net-theme, so its colours follow the pick.
 */
export function FaucetCard({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
  const { network } = useNetwork()
  const [tab, setTab] = useState<Tab>('wallet')
  const [busy, setBusy] = useState(false)
  const [track, setTrack] = useState<{ txid: string; network: NetworkId } | null>(null)
  const onTrack = (txid: string) => setTrack({ txid, network })

  const tabCls = (active: boolean) =>
    `flex h-9 flex-1 items-center justify-center rounded-input border text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
      active ? 'border-net bg-card text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`

  return (
    <div
      data-network={network}
      className="net-theme overflow-hidden rounded-card border border-net-bd bg-card shadow-card transition-colors"
    >
      {/* Network stripe: the first thing the eye lands on is which network pays out. */}
      <div className="h-1 bg-net transition-colors" aria-hidden />

      <div className="flex flex-col gap-5 p-5 min-[480px]:p-6">
        <NetworkPicker locked={busy} />

        <div>
          <div className="label mb-2">02 · Method</div>
          <div className="flex gap-[3px] rounded-panel bg-muted p-[3px]" role="tablist" aria-label="Claim method">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'wallet'}
            disabled={busy}
            onClick={() => setTab('wallet')}
            className={tabCls(tab === 'wallet')}
          >
            BRC-100 wallet
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'address'}
            disabled={busy}
            onClick={() => setTab('address')}
            className={tabCls(tab === 'address')}
          >
            Paste an address
          </button>
          </div>
        </div>

        {tab === 'wallet' && (
          <WalletPanel
            siteKey={siteKey}
            payoutSats={payoutSats}
            onUsePaste={() => setTab('address')}
            onTrack={onTrack}
            onBusy={setBusy}
          />
        )}

        {tab === 'address' && (
          <AddressPanel siteKey={siteKey} payoutSats={payoutSats} onTrack={onTrack} onBusy={setBusy} />
        )}
      </div>

      {track && (
        <TxStatusModal
          key={track.txid}
          txid={track.txid}
          network={track.network}
          onClose={() => setTrack(null)}
        />
      )}
    </div>
  )
}
