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
 * Build, sign, broadcast (via arcade) a P2PKH payout to `address` and return the EF.
 * Two-phase (createAction signAndProcess:false -> signAction) so we hold a `reference`
 * and can abortAction on broadcast failure. Pure-change payout -> no live chaintracks needed.
 */
export async function payToAddress(address: string, satoshis: number): Promise<{ txid: string; ef: string }> {
  const { wallet } = await getWallet()
  const lockingScript = new P2PKH().lock(address).toHex()

  const created = await wallet.createAction({
    description: 'teratestnet faucet payout',
    outputs: [{ lockingScript, satoshis, outputDescription: 'faucet payout' }],
    options: { signAndProcess: false, acceptDelayedBroadcast: false, randomizeOutputs: false },
  })

  const reference = created.signableTransaction?.reference
  if (!reference) {
    if (created.txid && created.tx) {
      return { txid: created.txid, ef: Transaction.fromAtomicBEEF(created.tx).toHexEF() }
    }
    throw new Error('createAction returned neither a signable transaction nor a completed tx')
  }

  try {
    const signed = await wallet.signAction({ reference, spends: {}, options: { acceptDelayedBroadcast: false } })
    if (!signed.txid || !signed.tx) throw new Error('signAction did not return a broadcast transaction')
    return { txid: signed.txid, ef: Transaction.fromAtomicBEEF(signed.tx).toHexEF() }
  } catch (e) {
    await wallet.abortAction({ reference }).catch(() => {})
    throw e
  }
}

/** Total spendable balance (sats) the faucet wallet holds in its default basket. */
export async function getFaucetBalanceSats(): Promise<number> {
  const { wallet } = await getWallet()
  const outs: any = await wallet.listOutputs({ basket: 'default', limit: 10000 })
  return ((outs.outputs ?? []) as Array<{ satoshis?: number }>).reduce((sum, o) => sum + (o.satoshis ?? 0), 0)
}
