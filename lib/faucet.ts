import { prisma } from './prisma'
import { assertTestnetP2PKH } from './address'
import { getConfig } from './config'

export interface ClaimRequest {
  address: string
  amountSats?: number
  ipHash: string
  apiKeyId?: string
  idempotencyKey?: string
  // test overrides (default to config in production)
  maxSats?: number
  defaultSats?: number
}

export interface ClaimResult {
  txid: string
  ef: string
  amountSats: number
}

export interface FaucetDeps {
  pay: (address: string, satoshis: number) => Promise<{ txid: string; ef: string }>
}

export async function claimToAddress(req: ClaimRequest, deps: FaucetDeps): Promise<ClaimResult> {
  // 1. Validate address (throws on bad input, before any payout).
  assertTestnetP2PKH(req.address)

  // 2. Idempotency: replay a prior result if the key was seen.
  if (req.idempotencyKey) {
    const prior = await prisma.claim.findUnique({ where: { idempotencyKey: req.idempotencyKey } })
    if (prior && prior.txid && prior.ef) {
      return { txid: prior.txid, ef: prior.ef, amountSats: prior.amountSats }
    }
  }

  // 3. Resolve + cap amount.
  let defaultSats = req.defaultSats
  let maxSats = req.maxSats
  if (defaultSats === undefined || maxSats === undefined) {
    const cfg = getConfig()
    defaultSats = defaultSats ?? cfg.FAUCET_PAYOUT_SATS
    maxSats = maxSats ?? cfg.FAUCET_MAX_SATS
  }
  const requested = req.amountSats ?? defaultSats
  const amountSats = Math.min(requested, maxSats)

  // 4. Create a pending claim row (captures idempotency key uniqueness).
  const claim = await prisma.claim.create({
    data: {
      recipient: req.address,
      amountSats,
      ipHash: req.ipHash,
      apiKeyId: req.apiKeyId ?? null,
      idempotencyKey: req.idempotencyKey ?? null,
      status: 'pending',
    },
  })

  // 5. Pay.
  try {
    const { txid, ef } = await deps.pay(req.address, amountSats)
    await prisma.claim.update({ where: { id: claim.id }, data: { txid, ef, status: 'broadcast' } })
    return { txid, ef, amountSats }
  } catch (e) {
    await prisma.claim.update({ where: { id: claim.id }, data: { status: 'failed' } })
    throw e
  }
}
