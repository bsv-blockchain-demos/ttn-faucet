// Minimal ChaintracksClientApi implementation backed by arcade's /chaintracks/v2 routes.
// Only the methods the toolbox SPV path calls are implemented; the rest throw.

export interface BlockHeaderLike {
  version: number
  previousHash: string
  merkleRoot: string
  time: number
  bits: number
  nonce: number
  height: number
  hash: string
}

export class ArcadeChaintracks {
  constructor(private readonly chain: 'main' | 'test', private readonly baseUrl: string) {}

  private async getJson<T>(path: string): Promise<T | undefined> {
    const resp = await fetch(`${this.baseUrl}${path}`)
    if (!resp.ok) return undefined
    return (await resp.json()) as T
  }

  async getChain(): Promise<'main' | 'test'> {
    return this.chain
  }

  async getPresentHeight(): Promise<number> {
    const r = await this.getJson<{ height: number }>('/height')
    if (!r || typeof r.height !== 'number') throw new Error('chaintracks /height unavailable')
    return r.height
  }

  async currentHeight(): Promise<number> {
    return this.getPresentHeight()
  }

  async findHeaderForHeight(height: number): Promise<BlockHeaderLike | undefined> {
    return this.getJson<BlockHeaderLike>(`/header/height/${height}`)
  }

  async findHeaderForBlockHash(hash: string): Promise<BlockHeaderLike | undefined> {
    return this.getJson<BlockHeaderLike>(`/header/hash/${hash}`)
  }

  async isValidRootForHeight(root: string, height: number): Promise<boolean> {
    const h = await this.findHeaderForHeight(height)
    return !!h && h.merkleRoot === root
  }

  // --- Unused ChaintracksClientApi surface: throw (mirrors BHServiceClient) ---
  private notImplemented(): never {
    throw new Error('Not implemented')
  }
  getInfo(): never { return this.notImplemented() }
  getHeaders(): never { return this.notImplemented() }
  findChainTipHeader(): never { return this.notImplemented() }
  findChainTipHash(): never { return this.notImplemented() }
  addHeader(): never { return this.notImplemented() }
  startListening(): never { return this.notImplemented() }
  listening(): never { return this.notImplemented() }
  isListening(): never { return this.notImplemented() }
  isSynchronized(): never { return this.notImplemented() }
  subscribeHeaders(): never { return this.notImplemented() }
  subscribeReorgs(): never { return this.notImplemented() }
  unsubscribe(): never { return this.notImplemented() }
}
