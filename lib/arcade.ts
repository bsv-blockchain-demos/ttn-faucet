export interface BroadcastResult {
  ok: boolean
  txid?: string
  alreadyKnown: boolean
  doubleSpend: boolean
  rejected: boolean
  raw: unknown
}

export interface ArcadeTxStatus {
  txid: string
  txStatus: string
  blockHash?: string
  blockHeight?: number
  merklePath?: string
  raw: unknown
}

/** POST {url}/tx with JSON {rawTx}. arcade returns 202 {status:'submitted'} or {status:'already submitted',...}. */
export async function broadcastRawTx(arcadeUrl: string, rawTxHex: string): Promise<BroadcastResult> {
  const resp = await fetch(`${arcadeUrl}/tx`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rawTx: rawTxHex }),
  })
  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  const statusStr = String(body.status ?? '')
  const stateStr = String(body.state ?? '')
  const alreadyKnown = statusStr === 'already submitted'
  const submitted = resp.status === 202 || statusStr === 'submitted' || alreadyKnown
  const doubleSpend = /DOUBLE_SPEND/i.test(statusStr) || /DOUBLE_SPEND/i.test(stateStr)
  const rejected = /REJECT/i.test(statusStr) || /REJECT/i.test(stateStr)
  return {
    ok: submitted && !doubleSpend && !rejected,
    txid: typeof body.txid === 'string' ? body.txid : undefined,
    alreadyKnown,
    doubleSpend,
    rejected,
    raw: body,
  }
}

/** GET {url}/tx/{txid}. Returns null on 404. `merklePath` present only once MINED. */
export async function getTxStatus(arcadeUrl: string, txid: string): Promise<ArcadeTxStatus | null> {
  const resp = await fetch(`${arcadeUrl}/tx/${txid}`)
  if (resp.status === 404) return null
  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  return {
    txid: String(body.txid ?? txid),
    txStatus: String(body.txStatus ?? 'UNKNOWN'),
    blockHash: typeof body.blockHash === 'string' ? body.blockHash : undefined,
    blockHeight: typeof body.blockHeight === 'number' ? body.blockHeight : undefined,
    merklePath: typeof body.merklePath === 'string' && body.merklePath.length > 0 ? body.merklePath : undefined,
    raw: body,
  }
}
