import 'server-only'
import {
  Wallet,
  WalletStorageManager,
  StorageKnex,
  Services,
} from '@bsv/wallet-toolbox'
import {
  PrivateKey,
  CachedKeyDeriver,
  Transaction,
  MerklePath,
  P2PKH,
  Beef,
  Utils,
  Random,
} from '@bsv/sdk'
import { knex as makeKnex } from 'knex'
import { getConfig, CHAIN } from './config'
import { deriveBrc29, newDerivationValues } from './brc29'
import { broadcastRawTx, getTxStatus } from './arcade'
import { ArcadeChaintracks } from './arcade-chaintracks'
import { makeArcadePostBeefResult } from './postbeef-result'

let walletPromise: Promise<{ wallet: Wallet; identityKey: string; services: Services }> | null = null

export function getWallet() {
  if (!walletPromise) walletPromise = buildWallet()
  return walletPromise
}

async function buildWallet() {
  const cfg = getConfig()
  const rootKey = PrivateKey.fromHex(cfg.WALLET_ROOT_KEY_HEX)
  const keyDeriver = new CachedKeyDeriver(rootKey)
  const identityKey = rootKey.toPublicKey().toString()

  const storage = new WalletStorageManager(identityKey)
  const knex = makeKnex({
    client: 'sqlite3',
    connection: { filename: cfg.WALLET_STORAGE_PATH },
    useNullAsDefault: true,
  })
  const activeStorage = new StorageKnex({
    chain: CHAIN,
    knex,
    commissionSatoshis: 0,
    commissionPubKeyHex: undefined,
    feeModel: { model: 'sat/kb', value: 1 },
  })
  await activeStorage.migrate('faucet', Utils.toHex(Random(33)))
  await activeStorage.makeAvailable()
  await storage.addWalletStorageProvider(activeStorage)
  await activeStorage.findOrInsertUser(identityKey)

  const options = Services.createDefaultOptions(CHAIN)
  options.chaintracks = new ArcadeChaintracks(
    CHAIN,
    cfg.ARCADE_CHAINTRACKS_URL,
  ) as unknown as typeof options.chaintracks
  const services = new Services(options)

  services.postBeefServices.services = [
    {
      name: 'arcade',
      service: async (beef: Beef, txids: string[]) => {
        const subjectTxid = txids[txids.length - 1]
        const tx = beef.findAtomicTransaction(subjectTxid) ?? beef.findTxid(subjectTxid)?.tx
        if (!tx) {
          return makeArcadePostBeefResult(txids, {
            ok: false,
            alreadyKnown: false,
            doubleSpend: false,
            rejected: false,
            raw: { error: 'tx not found in beef' },
          })
        }
        // arcade-v2 POST /tx requires extended format (EF). The toolbox includes input
        // source data, so toHexEF() works; fall back to raw only if it's somehow absent.
        let txHex: string
        try {
          txHex = tx.toHexEF()
        } catch {
          txHex = tx.toHex()
        }
        const b = await broadcastRawTx(cfg.ARCADE_URL, txHex)
        return makeArcadePostBeefResult(txids, b)
      },
    },
  ] as unknown as typeof services.postBeefServices.services

  services.getMerklePathServices.add({
    name: 'arcade',
    service: async (txid: string) => {
      const st = await getTxStatus(cfg.ARCADE_URL, txid)
      if (!st || st.txStatus !== 'MINED' || !st.merklePath) return { name: 'arcade', notes: [] }
      return { name: 'arcade', merklePath: MerklePath.fromHex(st.merklePath) }
    },
  })

  const wallet = new Wallet({ chain: CHAIN, keyDeriver, storage, services })
  return { wallet, identityKey, services }
}

/**
 * Shared two-phase payout: createAction(signAndProcess:false) -> signAction, so we hold a
 * `reference` and can abortAction on broadcast failure. Returns the broadcast tx as AtomicBEEF
 * bytes; callers serialize it (EF for the dev API, hex AtomicBEEF for wallet onboarding). The
 * payout is output 0 and is relinquished from wallet tracking (see stopTrackingPayoutOutput).
 * Pure-change payout -> no live chaintracks needed.
 */
async function signAndBroadcast(
  lockingScriptHex: string,
  satoshis: number,
  description: string,
): Promise<{ txid: string; atomicBEEF: number[] }> {
  const { wallet } = await getWallet()

  const created = await wallet.createAction({
    description,
    outputs: [{ lockingScript: lockingScriptHex, satoshis, outputDescription: 'faucet payout' }],
    options: { signAndProcess: false, acceptDelayedBroadcast: false, randomizeOutputs: false },
  })

  const reference = created.signableTransaction?.reference
  if (!reference) {
    if (created.txid && created.tx) {
      await stopTrackingPayoutOutput(wallet, created.txid)
      return { txid: created.txid, atomicBEEF: created.tx }
    }
    throw new Error('createAction returned neither a signable transaction nor a completed tx')
  }

  try {
    const signed = await wallet.signAction({ reference, spends: {}, options: { acceptDelayedBroadcast: false } })
    if (!signed.txid || !signed.tx) throw new Error('signAction did not return a broadcast transaction')
    await stopTrackingPayoutOutput(wallet, signed.txid)
    return { txid: signed.txid, atomicBEEF: signed.tx }
  } catch (e) {
    await wallet.abortAction({ reference }).catch(() => {})
    throw e
  }
}

/**
 * Build, sign, broadcast (via arcade) a P2PKH payout to `address` and return the EF.
 */
export async function payToAddress(address: string, satoshis: number): Promise<{ txid: string; ef: string }> {
  const lockingScript = new P2PKH().lock(address).toHex()
  const { txid, atomicBEEF } = await signAndBroadcast(lockingScript, satoshis, 'teratestnet faucet payout')
  return { txid, ef: Transaction.fromAtomicBEEF(atomicBEEF).toHexEF() }
}

export interface WalletPayout {
  txid: string
  atomicBEEF: string
  derivationPrefix: string
  derivationSuffix: string
  senderIdentityKey: string
  outputIndex: number
}

/**
 * Build, sign, broadcast (via arcade) a BRC-29 payment to `recipientIdentityKeyHex` and return the
 * AtomicBEEF (hex) plus the remittance the recipient's wallet needs to accept it via
 * `internalizeAction({ protocol: 'wallet payment', paymentRemittance })`. The returned BEEF carries
 * the funded ancestors' proofs, so the recipient can accept the coins immediately (no mining wait).
 */
export async function payToWallet(recipientIdentityKeyHex: string, satoshis: number): Promise<WalletPayout> {
  const cfg = getConfig()
  const rootKey = PrivateKey.fromHex(cfg.WALLET_ROOT_KEY_HEX)
  const { derivationPrefix, derivationSuffix } = newDerivationValues()
  const { lockingScriptHex, senderIdentityKeyHex } = deriveBrc29({
    recipientIdentityKeyHex,
    senderPrivateKey: rootKey,
    derivationPrefix,
    derivationSuffix,
  })
  const { txid, atomicBEEF } = await signAndBroadcast(lockingScriptHex, satoshis, 'teratestnet faucet payout (wallet)')
  return {
    txid,
    atomicBEEF: Utils.toHex(atomicBEEF),
    derivationPrefix,
    derivationSuffix,
    senderIdentityKey: senderIdentityKeyHex,
    outputIndex: 0,
  }
}

/**
 * The payout is output 0 (randomizeOutputs:false). The toolbox otherwise records it as a
 * spendable wallet UTXO — but it pays an external address the wallet can't sign, so leaving it
 * tracked inflates the balance and pollutes coin selection. Relinquish it so only real change
 * (output 1) stays tracked. Best-effort: never fail a successful payout over this bookkeeping.
 */
async function stopTrackingPayoutOutput(wallet: Wallet, txid: string): Promise<void> {
  await wallet.relinquishOutput({ basket: 'default', output: `${txid}.0` }).catch(() => {})
}

/** Total spendable balance (sats) the faucet wallet holds in its default basket. */
export async function getFaucetBalanceSats(): Promise<number> {
  const { wallet } = await getWallet()
  const outs: any = await wallet.listOutputs({ basket: 'default', limit: 10000 })
  return ((outs.outputs ?? []) as Array<{ satoshis?: number }>).reduce((sum, o) => sum + (o.satoshis ?? 0), 0)
}
