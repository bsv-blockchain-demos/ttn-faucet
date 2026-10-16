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
 * The whole card carries data-network, so network-coloured accents follow the pick.
 */
export function FaucetCard({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
  const { network } = useNetwork()
  const [tab, setTab] = useState<Tab>('wallet')
  const [busy, setBusy] = useState(false)
  const [track, setTrack] = useState<{ txid: string; network: NetworkId } | null>(null)
  const onTrack = (txid: string) => setTrack({ txid, network })

  const tabCls = (active: boolean) =>
    `flex h-9 flex-1 items-center justify-center rounded-pill px-2 text-center text-[12.5px] font-semibold leading-tight transition disabled:cursor-not-allowed ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
    }`

  return (
    <div data-network={network} className="overflow-hidden rounded-card border border-hairline bg-card shadow-card">
      {/* Network stripe: the first thing the eye lands on is which network pays out. */}
      <div className="h-1.5 bg-net transition-colors" aria-hidden />

      <div className="flex flex-col gap-4 px-5 pb-5 pt-4 min-[480px]:px-6">
        <NetworkPicker locked={busy} />

        <div className="flex gap-1 rounded-pill bg-muted p-1" role="tablist" aria-label="Claim method">
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
