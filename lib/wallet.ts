import 'server-only'
import {
  Wallet,
  WalletStorageManager,
  StorageKnex,
  Services,
  createDefaultWalletServicesOptions,
} from '@bsv/wallet-toolbox'
import {
  PrivateKey,
  CachedKeyDeriver,
  Transaction,
  P2PKH,
  Beef,
  Utils,
  Random,
  type AtomicBEEF,
} from '@bsv/sdk'
import { knex as makeKnex } from 'knex'
import { networkConfig, type NetworkConfig } from './config'
import type { NetworkId } from './networks'
import { deriveBrc29, newDerivationValues } from './brc29'
import { broadcastRawTx } from './arcade'
import { ArcadeChaintracks } from './arcade-chaintracks'
import { makeArcadePostBeefResult } from './postbeef-result'
import { arcadeMerklePath, repairReorgedProofs, startProofCompletion } from './proofs'

type WalletArgs = ConstructorParameters<typeof Wallet>[0]

interface FaucetWallet {
  wallet: Wallet
  identityKey: string
  services: Services
  storage: WalletStorageManager
  chaintracks: ArcadeChaintracks
}

// One server wallet per network, each with its own storage, built on first use.
const wallets = new Map<NetworkId, Promise<FaucetWallet>>()

export function getWallet(network: NetworkId): Promise<FaucetWallet> {
  let w = wallets.get(network)
  if (!w) {
    w = buildWallet(networkConfig(network))
    // Don't cache a failed build (e.g. storage briefly unavailable): retry on the next request.
    w.catch(() => wallets.delete(network))
    wallets.set(network, w)
  }
  return w
}

async function buildWallet(cfg: NetworkConfig): Promise<FaucetWallet> {
  const { chain } = cfg
  const rootKey = PrivateKey.fromHex(cfg.walletRootKeyHex)
  const keyDeriver = new CachedKeyDeriver(rootKey)
  const identityKey = rootKey.toPublicKey().toString()

  const storage = new WalletStorageManager(identityKey)
  const knex = makeKnex({
    client: 'sqlite3',
    connection: { filename: cfg.walletStoragePath },
    useNullAsDefault: true,
  })
  const activeStorage = new StorageKnex({
    chain,
    knex,
    commissionSatoshis: 0,
    commissionPubKeyHex: undefined,
    feeModel: { model: 'sat/kb', value: 1 },
  })
  await activeStorage.migrate('faucet', Utils.toHex(Random(33)))
  await activeStorage.makeAvailable()
  await storage.addWalletStorageProvider(activeStorage)
  await activeStorage.findOrInsertUser(identityKey)

  // Pass our own chaintracks + arcade so the toolbox never builds its defaults (tstn has none).
  const chaintracks = new ArcadeChaintracks(chain, cfg.chaintracksUrl)
  const options = createDefaultWalletServicesOptions(
    chain,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    chaintracks as unknown as WalletServicesOptions['chaintracks'],
    cfg.arcadeUrl,
  )
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
        const b = await broadcastRawTx(cfg.arcadeUrl, txHex)
        return makeArcadePostBeefResult(txids, b)
      },
    },
  ] as unknown as typeof services.postBeefServices.services

  services.getMerklePathServices.add({
    name: 'arcade',
    service: (txid: string) => arcadeMerklePath(cfg.arcadeUrl, chaintracks, txid),
  })

  // The toolbox (CJS) types @bsv/sdk from its cjs build: same runtime class, separate declarations.
  const wallet = new Wallet({ chain, keyDeriver: keyDeriver as unknown as WalletArgs['keyDeriver'], storage, services })
  // Record merkle proofs as blocks arrive, so payout BEEFs stay small (see lib/proofs.ts).
  startProofCompletion(cfg.network, async () => ({ chain, storage, services, chaintracks }))
  return { wallet, identityKey, services, storage, chaintracks }
}

type WalletServicesOptions = ReturnType<typeof createDefaultWalletServicesOptions>

/**
 * Shared two-phase payout: createAction(signAndProcess:false) -> signAction, so we hold a
 * `reference` and can abortAction on broadcast failure. Returns the broadcast tx as AtomicBEEF
 * bytes; callers serialize it (EF for the dev API, hex AtomicBEEF for wallet onboarding). The
 * payout is output 0 and is relinquished from wallet tracking (see stopTrackingPayoutOutput).
 * Pure-change payout -> no live chaintracks needed.
 */
async function signAndBroadcast(
  network: NetworkId,
  lockingScriptHex: string,
  satoshis: number,
  description: string,
): Promise<{ txid: string; atomicBEEF: AtomicBEEF }> {
  try {
    return await signAndBroadcastOnce(network, lockingScriptHex, satoshis, description)
  } catch (e) {
    // The toolbox verifies the payout's BEEF before broadcasting. If a block it holds a proof for
    // was re-orged away, that check fails until the proof is updated: repair now and retry once,
    // rather than failing payouts until the next background pass.
    if (!(e instanceof Error) || !/merged Beef failed validation/i.test(e.message)) throw e
    const { storage, chaintracks } = await getWallet(network)
    const r = await repairReorgedProofs({ storage, chaintracks })
    console.log(`[proofs:${network}] payout hit a stale proof: ${r.orphanedBlocks} orphaned block(s), ${r.updated} proof(s) updated`)
    if (r.updated === 0) throw e
    return await signAndBroadcastOnce(network, lockingScriptHex, satoshis, description)
  }
}

async function signAndBroadcastOnce(
  network: NetworkId,
  lockingScriptHex: string,
  satoshis: number,
  description: string,
): Promise<{ txid: string; atomicBEEF: AtomicBEEF }> {
  const { wallet } = await getWallet(network)

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
export async function payToAddress(
  network: NetworkId,
  address: string,
  satoshis: number,
): Promise<{ txid: string; ef: string }> {
  const lockingScript = new P2PKH().lock(address).toHex()
  const { txid, atomicBEEF } = await signAndBroadcast(network, lockingScript, satoshis, `${network} faucet payout`)
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
export async function payToWallet(
  network: NetworkId,
  recipientIdentityKeyHex: string,
  satoshis: number,
): Promise<WalletPayout> {
  const rootKey = PrivateKey.fromHex(networkConfig(network).walletRootKeyHex)
  const { derivationPrefix, derivationSuffix } = newDerivationValues()
  const { lockingScriptHex, senderIdentityKeyHex } = deriveBrc29({
    recipientIdentityKeyHex,
    senderPrivateKey: rootKey,
    derivationPrefix,
    derivationSuffix,
  })
  const { txid, atomicBEEF } = await signAndBroadcast(
    network,
    lockingScriptHex,
    satoshis,
    `${network} faucet payout (wallet)`,
  )
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

/**
 * A payout's Atomic BEEF (hex) rebuilt from the wallet as it stands now. Ancestors proven since the
 * payout carry a merkle path instead of their own ancestry, so this is usually far smaller than the
 * copy stored at payout time. Null if the wallet can't build it.
 */
export async function freshAtomicBeef(network: NetworkId, txid: string): Promise<string | null> {
  const { storage } = await getWallet(network)
  try {
    const beef = await storage.runAsStorageProvider((sp) => sp.getBeefForTransaction(txid, {}))
    return Utils.toHex(beef.toBinaryAtomic(txid))
  } catch {
    return null
  }
}

/** Total spendable balance (sats) a network's faucet wallet holds in its default basket. */
export async function getFaucetBalanceSats(network: NetworkId): Promise<number> {
  const { wallet } = await getWallet(network)
  const outs: any = await wallet.listOutputs({ basket: 'default', limit: 10000 })
  return ((outs.outputs ?? []) as Array<{ satoshis?: number }>).reduce((sum, o) => sum + (o.satoshis ?? 0), 0)
}
