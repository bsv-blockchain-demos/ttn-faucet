import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MerklePath } from '@bsv/sdk'

vi.mock('./arcade', () => ({ getTxStatus: vi.fn() }))
import { getTxStatus } from './arcade'
import { arcadeMerklePath, repairReorgedProofs } from './proofs'
import type { BlockHeaderLike } from './arcade-chaintracks'

const txid = 'aa'.repeat(32)
const sibling = 'bb'.repeat(32)
const path = new MerklePath(500, [[{ offset: 0, hash: txid, txid: true }, { offset: 1, hash: sibling }]])
const root = path.computeRoot(txid)
const header = { version: 1, previousHash: '00'.repeat(32), merkleRoot: root, time: 0, bits: 0, nonce: 0, height: 500, hash: 'cc'.repeat(32) }

let findHeaderForHeight: ReturnType<typeof vi.fn<(height: number) => Promise<BlockHeaderLike | undefined>>>
beforeEach(() => {
  findHeaderForHeight = vi.fn(async (_height: number): Promise<BlockHeaderLike | undefined> => header)
  vi.mocked(getTxStatus).mockReset()
})

describe('arcadeMerklePath', () => {
  it('returns the merkle path with the block header the toolbox needs', async () => {
    vi.mocked(getTxStatus).mockResolvedValue({ txid, txStatus: 'MINED', merklePath: path.toHex(), blockHeight: 500 } as never)
    const r = await arcadeMerklePath('http://arcade', { findHeaderForHeight }, txid)
    expect(r.merklePath?.computeRoot(txid)).toBe(root)
    expect(r.header).toEqual(header)
    expect(findHeaderForHeight).toHaveBeenCalledWith(500)
  })

  it('rejects a path whose root does not match the chain', async () => {
    vi.mocked(getTxStatus).mockResolvedValue({ txid, txStatus: 'MINED', merklePath: path.toHex() } as never)
    findHeaderForHeight.mockResolvedValue({ ...header, merkleRoot: 'dd'.repeat(32) })
    expect((await arcadeMerklePath('http://arcade', { findHeaderForHeight }, txid)).merklePath).toBeUndefined()
  })

  it('returns no proof for unmined or unknown transactions', async () => {
    vi.mocked(getTxStatus).mockResolvedValueOnce({ txid, txStatus: 'SEEN_ON_NETWORK' } as never)
    expect((await arcadeMerklePath('http://arcade', { findHeaderForHeight }, txid)).merklePath).toBeUndefined()
    vi.mocked(getTxStatus).mockResolvedValueOnce(null as never)
    expect((await arcadeMerklePath('http://arcade', { findHeaderForHeight }, txid)).merklePath).toBeUndefined()
    expect(findHeaderForHeight).not.toHaveBeenCalled()
  })
})

describe('repairReorgedProofs', () => {
  const proof = (txid: string, height: number, blockHash: string) => ({ txid, height, blockHash })
  function deps(proofs: ReturnType<typeof proof>[], chain: Record<number, string | undefined>) {
    const reproveHeader = vi.fn(async (hash: string) => ({
      log: '',
      updated: proofs.filter((p) => p.blockHash === hash).map((p) => ({ was: p })),
      unchanged: [],
      unavailable: [],
    }))
    const findProvenTxs = vi.fn(async (_args: unknown) => proofs)
    const storage = { runAsStorageProvider: (fn: (sp: unknown) => unknown) => fn({ findProvenTxs }), reproveHeader }
    const findHeaderForHeight = vi.fn(async (h: number) => (chain[h] ? { ...header, height: h, hash: chain[h]! } : undefined))
    return { deps: { storage, chaintracks: { findHeaderForHeight } } as never, reproveHeader, findProvenTxs, findHeaderForHeight }
  }

  it('re-proves proofs whose block was orphaned, once per block', async () => {
    const d = deps(
      [proof('a', 100, 'old100'), proof('b', 100, 'old100'), proof('c', 101, 'good101')],
      { 100: 'new100', 101: 'good101' },
    )
    expect(await repairReorgedProofs(d.deps)).toEqual({ checked: 3, orphanedBlocks: 1, updated: 2, unavailable: 0 })
    expect(d.reproveHeader).toHaveBeenCalledTimes(1)
    expect(d.reproveHeader).toHaveBeenCalledWith('old100')
    expect(d.findHeaderForHeight).toHaveBeenCalledTimes(2) // one lookup per height
    expect(d.findProvenTxs.mock.calls[0][0]).toMatchObject({ since: expect.any(Date) })
  })

  it('does nothing when every proof is on the current chain', async () => {
    const d = deps([proof('a', 100, 'h100')], { 100: 'h100' })
    expect(await repairReorgedProofs(d.deps)).toMatchObject({ orphanedBlocks: 0, updated: 0 })
    expect(d.reproveHeader).not.toHaveBeenCalled()
  })

  it('treats a missing header as unknown, not as a re-org', async () => {
    const d = deps([proof('a', 100, 'h100')], {})
    expect(await repairReorgedProofs(d.deps)).toMatchObject({ orphanedBlocks: 0 })
    expect(d.reproveHeader).not.toHaveBeenCalled()
  })
})
