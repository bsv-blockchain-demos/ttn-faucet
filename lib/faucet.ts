import { prisma } from './prisma'
import { assertTestnetP2PKH, assertIdentityKey } from './address'
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

/** Resolve the payout amount, defaulting from config and capping at the per-request max. */
function resolveAmountSats(req: { amountSats?: number; maxSats?: number; defaultSats?: number }): number {
  let defaultSats = req.defaultSats
  let maxSats = req.maxSats
  if (defaultSats === undefined || maxSats === undefined) {
    const cfg = getConfig()
    defaultSats = defaultSats ?? cfg.FAUCET_PAYOUT_SATS
    maxSats = maxSats ?? cfg.FAUCET_MAX_SATS
  }
  return Math.min(req.amountSats ?? defaultSats, maxSats)
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
  const amountSats = resolveAmountSats(req)

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

export interface WalletClaimRequest {
  identityKey: string
  amountSats?: number
  ipHash: string
  apiKeyId?: string
  /** Store the remittance so an undelivered payout can be redelivered (mobile-wallet claims). */
  recordRemittance?: boolean
  // test overrides (default to config in production)
  maxSats?: number
  defaultSats?: number
}

export interface WalletPayment {
  txid: string
  atomicBEEF: string
  derivationPrefix: string
  derivationSuffix: string
  senderIdentityKey: string
  outputIndex: number
}

export type WalletClaimResult = WalletPayment & { amountSats: number }

export interface WalletFaucetDeps {
  payWallet: (identityKey: string, satoshis: number) => Promise<WalletPayment>
}

/**
 * BRC-100 onboarding claim: pay a BRC-29 output to the caller's wallet identity key and return the
 * AtomicBEEF + remittance for the wallet to `internalizeAction`. Mirrors `claimToAddress` but
 * keyed on an identity key (stored as the Claim `recipient`, which distinguishes it from `m…/n…`
 * address claims). No idempotency replay: derivation values are single-use and the one-click UI is
 * not an API contract; abuse is bounded by the guard's rate limit.
 */
export async function claimToWallet(req: WalletClaimRequest, deps: WalletFaucetDeps): Promise<WalletClaimResult> {
  // 1. Validate identity key (throws on bad input, before any payout).
  assertIdentityKey(req.identityKey)

  // 2. Resolve + cap amount.
  const amountSats = resolveAmountSats(req)

  // 3. Create a pending claim row.
  const claim = await prisma.claim.create({
    data: {
      recipient: req.identityKey,
      amountSats,
      ipHash: req.ipHash,
      apiKeyId: req.apiKeyId ?? null,
      status: 'pending',
    },
  })

  // 4. Pay.
  try {
    const payment = await deps.payWallet(req.identityKey, amountSats)
    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        txid: payment.txid,
        ef: payment.atomicBEEF,
        status: 'broadcast',
        remittance: req.recordRemittance ? JSON.stringify(remittanceOf(payment)) : null,
      },
    })
    return { ...payment, amountSats }
  } catch (e) {
    await prisma.claim.update({ where: { id: claim.id }, data: { status: 'failed' } })
    throw e
  }
}

type Remittance = Pick<WalletPayment, 'derivationPrefix' | 'derivationSuffix' | 'senderIdentityKey' | 'outputIndex'>

function remittanceOf(p: WalletPayment): Remittance {
  return {
    derivationPrefix: p.derivationPrefix,
    derivationSuffix: p.derivationSuffix,
    senderIdentityKey: p.senderIdentityKey,
    outputIndex: p.outputIndex,
  }
}

/** How far back an undelivered mobile payout is still redelivered instead of paying again. */
const REDELIVERY_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * The most recent mobile-wallet payout to `identityKey` that was broadcast but never confirmed as
 * accepted by the phone (e.g. the wallet app was backgrounded mid-delivery). Redelivering it is
 * safe: the wallet's internalizeAction tolerates a repeat.
 */
export async function findUndeliveredPayout(identityKey: string): Promise<WalletClaimResult | null> {
  const row = await prisma.claim.findFirst({
    where: {
      recipient: identityKey,
      status: 'broadcast',
      remittance: { not: null },
      deliveredAt: null,
      createdAt: { gte: new Date(Date.now() - REDELIVERY_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!row?.txid || !row.ef || !row.remittance) return null
  return { txid: row.txid, atomicBEEF: row.ef, amountSats: row.amountSats, ...(JSON.parse(row.remittance) as Remittance) }
}

/** Record that the phone accepted the payout. */
export async function markDelivered(txid: string): Promise<void> {
  await prisma.claim.updateMany({ where: { txid, deliveredAt: null }, data: { deliveredAt: new Date() } })
}

/** True if a payout to `identityKey` started recently and hasn't finished — don't start a second. */
export async function hasPayoutInFlight(identityKey: string, withinMs = 60_000): Promise<boolean> {
  const n = await prisma.claim.count({
    where: { recipient: identityKey, status: 'pending', createdAt: { gte: new Date(Date.now() - withinMs) } },
  })
  return n > 0
}
