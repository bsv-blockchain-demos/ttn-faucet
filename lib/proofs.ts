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

/**
 * Only accept proofs this many blocks below the tip. Teratestnet does re-org: a proof taken one
 * block below the tip later pointed at an orphaned block and broke every payout spending from it.
 */
export const CONFIRMATIONS = 3

/** How far back (by when a proof was recorded or updated) to look for proofs a re-org orphaned. */
const REORG_LOOKBACK_MS = 24 * 60 * 60 * 1000

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
    const r = await getProofs(task, reqs.slice(i, i + CHUNK), 0, false, false, tip - CONFIRMATIONS)
    proven += r.proven.length
  }
  return { checked: reqs.length, proven }
}

/**
 * Re-org repair: re-prove recently recorded proofs whose block is no longer the chain's block at
 * that height. A stale proof makes every payout BEEF that includes it fail the toolbox's
 * `beef.verify` ("merged Beef failed validation"). The toolbox's own repair (reproveHeader)
 * normally runs on chaintracks re-org events, which arcade's chaintracks doesn't provide.
 */
export async function repairReorgedProofs(
  deps: Pick<ProofDeps, 'storage' | 'chaintracks'>,
  lookbackMs = REORG_LOOKBACK_MS,
): Promise<{ checked: number; orphanedBlocks: number; updated: number; unavailable: number }> {
  const recent = await deps.storage.runAsStorageProvider((sp) =>
    sp.findProvenTxs({ partial: {}, since: new Date(Date.now() - lookbackMs) }),
  )
  const chainHash = new Map<number, string | undefined>()
  const orphaned = new Set<string>()
  for (const p of recent) {
    if (!chainHash.has(p.height)) chainHash.set(p.height, (await deps.chaintracks.findHeaderForHeight(p.height))?.hash)
    const hash = chainHash.get(p.height)
    // An unknown header (chaintracks hiccup) is not evidence of a re-org; check again next pass.
    if (hash && hash !== p.blockHash) orphaned.add(p.blockHash)
  }
  let updated = 0
  let unavailable = 0
  for (const hash of orphaned) {
    const r = await deps.storage.reproveHeader(hash)
    updated += r.updated.length
    unavailable += r.unavailable.length
  }
  return { checked: recent.length, orphanedBlocks: orphaned.size, updated, unavailable }
}

const PROOF_INTERVAL_MS = 60_000

// One job per server process, however many route bundles load lib/wallet.ts.
const g = globalThis as unknown as { __faucetProofJob?: boolean }

/** Run a repair + proof pass now and then every minute (skipping a tick if one is still running). */
export function startProofCompletion(getDeps: () => Promise<ProofDeps>, log: (msg: string) => void = console.log) {
  if (g.__faucetProofJob) return
  g.__faucetProofJob = true
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const deps = await getDeps()
      const repair = await repairReorgedProofs(deps)
      if (repair.orphanedBlocks > 0) {
        log(
          `[proofs] re-org: ${repair.orphanedBlocks} orphaned block(s), ${repair.updated} proof(s) updated, ${repair.unavailable} not yet re-mined`,
        )
      }
      const { checked, proven } = await completeProofs(deps)
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
