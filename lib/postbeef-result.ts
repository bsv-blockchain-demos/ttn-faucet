import type { BroadcastResult } from './arcade'

export interface PostTxResultForTxid {
  txid: string
  status: 'success' | 'error'
  alreadyKnown?: boolean
  doubleSpend?: boolean
  serviceError?: boolean
}
export interface PostBeefResult {
  name: string
  status: 'success' | 'error'
  txidResults: PostTxResultForTxid[]
  data?: unknown
}

export function makeArcadePostBeefResult(txids: string[], b: BroadcastResult): PostBeefResult {
  const status = b.ok ? 'success' : 'error'
  return {
    name: 'arcade',
    status,
    data: b.raw,
    txidResults: txids.map((txid) => ({
      txid,
      status,
      alreadyKnown: b.alreadyKnown || undefined,
      doubleSpend: b.doubleSpend || undefined,
      serviceError: !b.ok && !b.rejected && !b.doubleSpend ? true : undefined,
    })),
  }
}
