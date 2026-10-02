import { MerklePath } from '@bsv/sdk'
import { Monitor, type Services, type WalletStorageManager } from '@bsv/wallet-toolbox'
// Not re-exported from the package root (no "exports" map, so the deep path resolves).
import { getProofs } from '@bsv/wallet-toolbox/out/src/monitor/tasks/TaskCheckForProofs'
import type { GetMerklePathResult } from '@bsv/wallet-toolbox/out/src/sdk/WalletServices.interfaces'
import { getTxStatus } from './arcade'
import type { ArcadeChaintracks } from './arcade-chaintracks'

/**
 * Merkle proof completion for the faucet's server wallet.
 *
 * Every payout's Atomic BEEF carries its unproven ancestors. Without recorded proofs the wallet
 * treats every earlier payout's change as unconfirmed, so BEEFs grew to hundreds of transactions
 * (125 KB) even though arcade had mined them, too big for the mobile relay's 64 KiB messages.
 * Recording proofs as blocks arrive keeps a payout's BEEF to its parents since the last block
 * plus one merkle path each.
 */

/**
 * Proof service for the toolbox: arcade's merkle path plus the block header it needs
 * (EntityProvenTx.fromReq reads `header.merkleRoot`/`header.hash`). A path whose root doesn't match
 * the chaintracks header for its height is rejected.
 */
export async function arcadeMerklePath(
  arcadeUrl: string,
  chaintracks: Pick<ArcadeChaintracks, 'findHeaderForHeight'>,
  txid: string,
): Promise<GetMerklePathResult> {
  const none: GetMerklePathResult = { name: 'arcade', notes: [] }
  const st = await getTxStatus(arcadeUrl, txid)
  if (!st || st.txStatus !== 'MINED' || !st.merklePath) return none
  const merklePath = MerklePath.fromHex(st.merklePath)
  const header = await chaintracks.findHeaderForHeight(merklePath.blockHeight)
  if (!header || header.merkleRoot !== merklePath.computeRoot(txid)) return none
  return { name: 'arcade', merklePath, header, notes: [] }
}

/** Statuses of broadcast transactions still waiting for a proof (as TaskCheckForProofs uses). */
const AWAITING_PROOF = ['callback', 'unmined', 'sending', 'unknown', 'unconfirmed'] as const
const CHUNK = 50

export interface ProofDeps {
  chain: 'main' | 'test'
  storage: WalletStorageManager
  services: Services
  chaintracks: ArcadeChaintracks
}

/**
 * One pass: try to prove every transaction awaiting a proof. Doesn't count as a proof attempt, so
 * a transaction arcade can't find is never given up on (marked invalid) by this pass.
 */
export async function completeProofs(deps: ProofDeps): Promise<{ checked: number; proven: number }> {
  const tip = await deps.chaintracks.currentHeight()
  const options = Monitor.createDefaultWalletMonitorOptions(
    deps.chain,
    deps.storage,
    deps.services,
    deps.chaintracks as unknown as Parameters<typeof Monitor.createDefaultWalletMonitorOptions>[3],
  )
  // This pass needs no header/reorg events (arcade's chaintracks has none to subscribe to).
  options.chaintracksWithEvents = undefined
  const monitor = new Monitor(options)
  const task = { monitor, storage: monitor.storage } as unknown as Parameters<typeof getProofs>[0]
  // Fetch the whole list up front: proving changes statuses, which would shift offset paging.
  const reqs = await deps.storage.findProvenTxReqs({
    partial: {},
    status: [...AWAITING_PROOF],
    paged: { limit: 5000 },
  })
  let proven = 0
  for (let i = 0; i < reqs.length; i += CHUNK) {
    // tip - 1: skip proofs from the newest block, the one most likely to be re-orged.
    const r = await getProofs(task, reqs.slice(i, i + CHUNK), 0, false, false, tip - 1)
    proven += r.proven.length
  }
  return { checked: reqs.length, proven }
}

const PROOF_INTERVAL_MS = 60_000

// One job per server process, however many route bundles load lib/wallet.ts.
const g = globalThis as unknown as { __faucetProofJob?: boolean }

/** Run completeProofs now and then every minute (skipping a tick if a pass is still running). */
export function startProofCompletion(getDeps: () => Promise<ProofDeps>, log: (msg: string) => void = console.log) {
  if (g.__faucetProofJob) return
  g.__faucetProofJob = true
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const { checked, proven } = await completeProofs(await getDeps())
      if (proven > 0) log(`[proofs] recorded ${proven} of ${checked} pending proofs`)
    } catch (e) {
      log(`[proofs] pass failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      running = false
    }
  }
  void tick()
  setInterval(() => void tick(), PROOF_INTERVAL_MS).unref()
}
