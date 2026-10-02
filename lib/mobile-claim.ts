import type { GuardResult } from './guard'
import type { WalletClaimResult } from './faucet'
import { RelayError, type RelaySession, type RelayStatus } from './relay-api'

/**
 * Mobile-wallet claims over @bsv/wallet-relay, run by the faucet server the moment the phone
 * connects.
 *
 * On one phone only one app runs at a time: while BSV Wallet is open the browser tab is frozen, and
 * once the user switches back to the browser the wallet is frozen and its relay socket drops within
 * seconds. So nothing can wait for a click in the browser. Instead the server fetches the identity
 * key, pays, and hands the payment to the wallet (internalizeAction) right after the pairing is
 * approved, while the wallet is still on screen — about 2s end to end. The browser only shows the
 * outcome. A payout the wallet didn't accept is redelivered on the next connect instead of paying
 * again.
 */

export type MobileClaimState = 'waiting' | 'claiming' | 'done' | 'error' | 'expired'
export type MobileClaimErrorCode = 'disconnected' | 'undelivered' | 'rate_limit' | 'in_flight' | 'failed'

/** What the browser sees (never the desktop token). */
export interface MobileClaimView {
  state: MobileClaimState
  txid?: string
  amount?: number
  /** Present when state is 'done': the payout was a redelivery of an earlier undelivered one. */
  redelivered?: boolean
  code?: MobileClaimErrorCode
  error?: string
}

export interface NewMobileClaim {
  sessionId: string
  qrDataUrl: string
  pairingUri: string
}

export interface MobileClaimDeps {
  createSession: () => Promise<RelaySession>
  getStatus: (sessionId: string) => Promise<RelayStatus>
  call: <T>(session: RelaySession, method: string, params: unknown) => Promise<T>
  guard: (ip: string) => Promise<GuardResult>
  pay: (identityKey: string, ip: string) => Promise<WalletClaimResult>
  findUndelivered: (identityKey: string) => Promise<WalletClaimResult | null>
  markDelivered: (txid: string) => Promise<void>
  hasPayoutInFlight: (identityKey: string) => Promise<boolean>
  now?: () => number
  log?: (msg: string) => void
}

interface Entry {
  session: RelaySession
  ip: string
  createdAt: number
  view: MobileClaimView
}

/** Finished/expired claims are kept this long so a returning browser can read the outcome. */
const RETAIN_MS = 15 * 60 * 1000

/**
 * Most claims waiting for a phone at once. Starting a claim is unguarded (the guard runs on
 * connect) and every waiting claim is polled each sweep, so this bounds the load on the relay.
 */
export const MAX_WAITING = 200

class ClaimFailure extends Error {
  constructor(
    readonly code: MobileClaimErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const MESSAGES = {
  disconnected:
    'BSV Wallet disconnected before the claim could start. Try again, and stay in BSV Wallet for a few seconds after approving.',
  undelivered:
    "The coins were sent, but BSV Wallet closed before accepting them. Try again and approve in BSV Wallet: you'll receive this same payout, not a new one.",
  inFlight: 'A payout to this wallet is already in progress. Try again in a minute.',
} as const

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The relay rejects calls on a dead socket with "Session is disconnected"/"expired". */
function isSessionGone(err: unknown): boolean {
  return err instanceof RelayError && /^Session is (disconnected|expired|not found)/.test(err.message)
}

function internalizeArgs(p: WalletClaimResult) {
  return {
    tx: Array.from(Buffer.from(p.atomicBEEF, 'hex')),
    description: 'Teratestnet faucet payout',
    labels: ['faucet'],
    outputs: [
      {
        outputIndex: p.outputIndex,
        protocol: 'wallet payment',
        paymentRemittance: {
          derivationPrefix: p.derivationPrefix,
          derivationSuffix: p.derivationSuffix,
          senderIdentityKey: p.senderIdentityKey,
        },
      },
    ],
  }
}

export class MobileClaims {
  private readonly entries = new Map<string, Entry>()
  private readonly now: () => number

  constructor(private readonly deps: MobileClaimDeps) {
    this.now = deps.now ?? Date.now
  }

  /** Open a relay pairing session for a claim. The guard runs at connect time, not here. */
  async create(ip: string): Promise<NewMobileClaim> {
    let waiting = 0
    for (const e of this.entries.values()) if (e.view.state === 'waiting') waiting++
    if (waiting >= MAX_WAITING) throw new RelayError('Too many mobile claims in progress. Try again shortly.', 429)
    const session = await this.deps.createSession()
    this.entries.set(session.sessionId, { session, ip, createdAt: this.now(), view: { state: 'waiting' } })
    return { sessionId: session.sessionId, qrDataUrl: session.qrDataUrl, pairingUri: session.pairingUri }
  }

  view(sessionId: string): MobileClaimView | null {
    return this.entries.get(sessionId)?.view ?? null
  }

  /**
   * Look at a waiting claim's relay session: start the claim if the phone has connected, or mark
   * it expired. Safe to call often and from anywhere (relay webhook, sweep, browser poll).
   */
  async check(sessionId: string): Promise<void> {
    const entry = this.entries.get(sessionId)
    if (!entry || entry.view.state !== 'waiting') return
    let status: RelayStatus
    try {
      status = await this.deps.getStatus(sessionId)
    } catch {
      return // relay hiccup — the next check retries
    }
    if (entry.view.state !== 'waiting') return
    if (status === 'connected') void this.run(sessionId)
    else if (status === 'expired') entry.view = { state: 'expired' }
    else if (status === 'disconnected') entry.view = { state: 'error', code: 'disconnected', error: MESSAGES.disconnected }
  }

  /** Check every waiting claim and drop old ones. Called on an interval. */
  async sweep(): Promise<void> {
    const cutoff = this.now() - RETAIN_MS
    const waiting: string[] = []
    for (const [id, e] of this.entries) {
      if (e.createdAt < cutoff && e.view.state !== 'claiming') this.entries.delete(id)
      else if (e.view.state === 'waiting') waiting.push(id)
    }
    await Promise.all(waiting.map((id) => this.check(id)))
  }

  /** Identity key → payout (or redelivery) → internalizeAction, as fast as possible. */
  async run(sessionId: string): Promise<void> {
    const entry = this.entries.get(sessionId)
    if (!entry || entry.view.state !== 'waiting') return
    entry.view = { state: 'claiming' }
    const { deps } = this
    let paid: WalletClaimResult | null = null
    let redelivered = false
    try {
      // 1. Identity key first — every millisecond counts while the wallet is on screen.
      let identityKey: string
      try {
        ;({ publicKey: identityKey } = await deps.call<{ publicKey: string }>(entry.session, 'getPublicKey', {
          identityKey: true,
        }))
      } catch (err) {
        if (isSessionGone(err)) throw new ClaimFailure('disconnected', MESSAGES.disconnected)
        throw err
      }

      // 2. Redeliver an earlier payout the wallet never accepted, else pay a new one.
      paid = await deps.findUndelivered(identityKey)
      redelivered = paid !== null
      if (!paid) {
        if (await deps.hasPayoutInFlight(identityKey)) throw new ClaimFailure('in_flight', MESSAGES.inFlight)
        const g = await deps.guard(entry.ip)
        if (!g.ok) {
          throw new ClaimFailure(g.code === 'rate_limit' ? 'rate_limit' : 'failed', `${g.message}. No coins were sent.`)
        }
        paid = await deps.pay(identityKey, entry.ip)
      }

      // 3. Hand the payment to the wallet. internalizeAction tolerates a repeat, so a redelivery of
      //    something the phone did accept (but whose reply was lost) is harmless.
      try {
        await deps.call(entry.session, 'internalizeAction', internalizeArgs(paid))
      } catch (err) {
        deps.log?.(`[mobile-claim] internalizeAction failed session=${sessionId} txid=${paid.txid}: ${message(err)}`)
        throw new ClaimFailure('undelivered', MESSAGES.undelivered)
      }
      await deps.markDelivered(paid.txid)
      entry.view = { state: 'done', txid: paid.txid, amount: paid.amountSats, redelivered }
      deps.log?.(`[mobile-claim] delivered session=${sessionId} txid=${paid.txid} redelivered=${redelivered}`)
    } catch (err) {
      const failure = err instanceof ClaimFailure ? err : new ClaimFailure('failed', `Faucet error: ${message(err)}`)
      entry.view = {
        state: 'error',
        code: failure.code,
        error: failure.message,
        ...(paid ? { txid: paid.txid, amount: paid.amountSats } : {}),
      }
      deps.log?.(`[mobile-claim] failed session=${sessionId} code=${failure.code}: ${message(err)}`)
    }
  }
}
