import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MerklePath } from '@bsv/sdk'

vi.mock('./arcade', () => ({ getTxStatus: vi.fn() }))
import { getTxStatus } from './arcade'
import { arcadeMerklePath } from './proofs'
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
