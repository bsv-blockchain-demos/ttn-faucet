'use client'
import { useState } from 'react'
import { WalletPanel } from './WalletClaim'
import { AddressPanel } from './ClaimForm'
import { TxStatusModal } from './TxStatusModal'
import { NetworkPicker } from './NetworkPicker'
import { ClipboardText, Wallet } from '@phosphor-icons/react/dist/ssr'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { SEGMENT_TRACK, segmentCls } from './buttons'
import { useNetwork } from './NetworkProvider'
import type { NetworkId } from '@/lib/networks'

type Tab = 'wallet' | 'address'

/**
 * The faucet card: pick a network, then claim with a BRC-100 wallet (default) or to an address.
 * Styled as a bsvblockchain.org card; the network shows as a coloured dot and name, not a theme.
 */
export function FaucetCard({ siteKey, payoutSats }: { siteKey: string; payoutSats: number }) {
  const { network } = useNetwork()
  const [tab, setTab] = useState<Tab>('wallet')
  const [busy, setBusy] = useState(false)
  const [track, setTrack] = useState<{ txid: string; network: NetworkId } | null>(null)
  const onTrack = (txid: string) => setTrack({ txid, network })

  const tabCls = (active: boolean) => segmentCls(active, 'whitespace-nowrap disabled:opacity-50')

  return (
    <div
      data-network={network}
      className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-raised dark:shadow-none"
    >
      <div className="flex flex-col gap-6 p-5 min-[480px]:p-6">
        <NetworkPicker locked={busy} />

        <div>
          <div className="label mb-3">Method</div>
          <div className={`grid grid-cols-2 gap-1 ${SEGMENT_TRACK}`} role="tablist" aria-label="Claim method">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="tab"
                id="tab-wallet"
                aria-controls="panel-claim"
                aria-selected={tab === 'wallet'}
                data-glow={tab === 'wallet' ? '' : undefined}
                disabled={busy}
                onClick={() => setTab('wallet')}
                className={tabCls(tab === 'wallet')}
              >
                <Wallet aria-hidden weight="duotone" className="size-4.5 flex-none" />
                Connect Wallet
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>Connect a BRC-100 compatible wallet</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="tab"
                id="tab-address"
                aria-controls="panel-claim"
                aria-selected={tab === 'address'}
                data-glow={tab === 'address' ? '' : undefined}
                disabled={busy}
                onClick={() => setTab('address')}
                className={tabCls(tab === 'address')}
              >
                <ClipboardText aria-hidden weight="duotone" className="size-4.5 flex-none" />
                Paste a 1address
              </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>Send coins straight to a legacy P2PKH address, no wallet needed</TooltipContent>
          </Tooltip>
          </div>
        </div>

        <div id="panel-claim" role="tabpanel" aria-labelledby={`tab-${tab}`}>
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
