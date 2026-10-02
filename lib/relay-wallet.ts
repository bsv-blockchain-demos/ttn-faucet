import type { WalletInterface } from '@bsv/sdk'
import { relayRequest, type PairingSession } from './relay-client'

/** The wallet surface the faucet's claim flow needs — met by WalletClient and RelayWallet alike. */
export type FaucetWallet = Pick<WalletInterface, 'getPublicKey' | 'internalizeAction'>

/**
 * A mobile wallet paired over @bsv/wallet-relay, presented as the (partial) BRC-100 wallet the
 * claim flow needs. The relay doesn't carry getNetwork, so a paired phone's network is unknown.
 */
export class RelayWallet implements FaucetWallet {
  constructor(readonly session: PairingSession) {}

  getPublicKey: WalletInterface['getPublicKey'] = (args) => relayRequest(this.session, 'getPublicKey', args)

  internalizeAction: WalletInterface['internalizeAction'] = (args) =>
    relayRequest(this.session, 'internalizeAction', args)
}
