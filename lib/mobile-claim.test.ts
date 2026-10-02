import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MAX_WAITING, MobileClaims, type MobileClaimDeps } from './mobile-claim'
import { RelayError, type RelayStatus } from './relay-api'
import type { WalletClaimResult } from './faucet'

const IDENTITY = '02' + 'ab'.repeat(32)
const session = { sessionId: 's1', desktopToken: 'tok', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair?topic=s1' }
const payment: WalletClaimResult = {
  txid: 'tx1',
  atomicBEEF: '0101010100',
  derivationPrefix: 'pfx',
  derivationSuffix: 'sfx',
  senderIdentityKey: '03' + 'cd'.repeat(32),
  outputIndex: 0,
  amountSats: 100_000,
}

let status: RelayStatus
let deps: { [K in keyof MobileClaimDeps]-?: ReturnType<typeof vi.fn> }
let claims: MobileClaims

/** Phone that answers getPublicKey and accepts internalizeAction unless told otherwise. */
function phone(overrides: Partial<Record<string, (params: unknown) => unknown>> = {}) {
  deps.call.mockImplementation(async (_s: unknown, method: string, params: unknown) => {
    if (overrides[method]) return overrides[method]!(params)
    if (method === 'getPublicKey') return { publicKey: IDENTITY }
    if (method === 'internalizeAction') return { accepted: true }
    throw new Error(`unexpected ${method}`)
  })
}

beforeEach(async () => {
  status = 'pending'
  deps = {
    createSession: vi.fn(async () => session),
    getStatus: vi.fn(async () => status),
    call: vi.fn(),
    guard: vi.fn(async () => ({ ok: true, subject: 'h' })),
    pay: vi.fn(async () => payment),
    findUndelivered: vi.fn(async () => null),
    refreshBeef: vi.fn(async () => null),
    markDelivered: vi.fn(async () => {}),
    hasPayoutInFlight: vi.fn(async () => false),
    now: vi.fn(() => 1_000_000),
    log: vi.fn(),
  }
  phone()
  claims = new MobileClaims(deps as unknown as MobileClaimDeps)
  await claims.create('1.2.3.4')
})

async function connectAndSettle() {
  status = 'connected'
  await claims.check('s1')
  await vi.waitFor(() => expect(claims.view('s1')?.state).not.toBe('claiming'))
}

describe('MobileClaims', () => {
  it('creates a waiting claim without exposing the desktop token', async () => {
    const created = await claims.create('1.2.3.4')
    expect(created).toEqual({ sessionId: 's1', qrDataUrl: 'data:qr', pairingUri: 'bsv-wallet://pair?topic=s1' })
    expect(claims.view('s1')).toEqual({ state: 'waiting' })
  })

  it('does nothing until the phone connects', async () => {
    await claims.check('s1')
    expect(claims.view('s1')?.state).toBe('waiting')
    expect(deps.call).not.toHaveBeenCalled()
  })

  it('on connect: identity key first, then guard, pay, internalize, mark delivered', async () => {
    await connectAndSettle()
    expect(claims.view('s1')).toEqual({ state: 'done', txid: 'tx1', amount: 100_000, redelivered: false })
    expect(deps.call.mock.calls.map((c) => c[1])).toEqual(['getPublicKey', 'internalizeAction'])
    expect(deps.call.mock.invocationCallOrder[0]).toBeLessThan(deps.guard.mock.invocationCallOrder[0])
    expect(deps.guard).toHaveBeenCalledWith('1.2.3.4')
    expect(deps.pay).toHaveBeenCalledWith(IDENTITY, '1.2.3.4')
    const internalize = deps.call.mock.calls[1][2] as { tx: number[]; outputs: Array<{ paymentRemittance: unknown }> }
    expect(internalize.tx).toEqual([1, 1, 1, 1, 0])
    expect(internalize.outputs[0].paymentRemittance).toEqual({
      derivationPrefix: 'pfx',
      derivationSuffix: 'sfx',
      senderIdentityKey: payment.senderIdentityKey,
    })
    expect(deps.markDelivered).toHaveBeenCalledWith('tx1')
  })

  it('runs once even if connect is reported repeatedly', async () => {
    status = 'connected'
    await Promise.all([claims.check('s1'), claims.check('s1'), claims.sweep()])
    await vi.waitFor(() => expect(claims.view('s1')?.state).toBe('done'))
    expect(deps.pay).toHaveBeenCalledTimes(1)
  })

  it('redelivers an undelivered payout instead of paying again', async () => {
    deps.findUndelivered.mockResolvedValue({ ...payment, txid: 'old' })
    deps.refreshBeef.mockResolvedValue('0102')
    await connectAndSettle()
    expect(deps.refreshBeef).toHaveBeenCalledWith('old')
    // The rebuilt (smaller) BEEF is what the wallet receives.
    expect((deps.call.mock.calls[1][2] as { tx: number[] }).tx).toEqual([1, 2])
    expect(deps.pay).not.toHaveBeenCalled()
    expect(deps.guard).not.toHaveBeenCalled()
    expect(deps.markDelivered).toHaveBeenCalledWith('old')
    expect(claims.view('s1')).toMatchObject({ state: 'done', txid: 'old', redelivered: true })
  })

  it('keeps the payout undelivered (txid shown) when the wallet drops before accepting', async () => {
    phone({
      internalizeAction: () => {
        throw new RelayError('Session is disconnected', 400)
      },
    })
    await connectAndSettle()
    expect(claims.view('s1')).toMatchObject({ state: 'error', code: 'undelivered', txid: 'tx1', amount: 100_000 })
    expect(deps.markDelivered).not.toHaveBeenCalled()
  })

  it('falls back to the stored BEEF when it cannot be rebuilt', async () => {
    deps.findUndelivered.mockResolvedValue({ ...payment, txid: 'old' })
    deps.refreshBeef.mockRejectedValue(new Error('no storage'))
    await connectAndSettle()
    expect((deps.call.mock.calls[1][2] as { tx: number[] }).tx).toEqual([1, 1, 1, 1, 0])
    expect(claims.view('s1')?.state).toBe('done')
  })

  it('says so honestly when the payment is too large for the relay', async () => {
    phone({
      internalizeAction: () => {
        throw new RelayError('Relay plaintext exceeds 48 KiB', 413)
      },
    })
    await connectAndSettle()
    expect(claims.view('s1')).toMatchObject({ state: 'error', code: 'too_large', txid: 'tx1' })
    expect(claims.view('s1')?.error).toMatch(/too large for the mobile connection/)
  })

  it('names the reason for other delivery failures instead of blaming the wallet', async () => {
    phone({
      internalizeAction: () => {
        throw new RelayError('Wallet storage busy', 500)
      },
    })
    await connectAndSettle()
    expect(claims.view('s1')).toMatchObject({ state: 'error', code: 'undelivered' })
    expect(claims.view('s1')?.error).toMatch(/delivering them to BSV Wallet failed \(Wallet storage busy\)/)
  })

  it('reports a disconnect before the identity key without paying', async () => {
    phone({
      getPublicKey: () => {
        throw new RelayError('Session is disconnected', 400)
      },
    })
    await connectAndSettle()
    expect(claims.view('s1')).toMatchObject({ state: 'error', code: 'disconnected' })
    expect(deps.pay).not.toHaveBeenCalled()
  })

  it('surfaces a rate limit without paying', async () => {
    deps.guard.mockResolvedValue({ ok: false, code: 'rate_limit', status: 429, message: 'Rate limit exceeded' })
    await connectAndSettle()
    expect(claims.view('s1')).toMatchObject({ state: 'error', code: 'rate_limit' })
    expect(claims.view('s1')?.error).toMatch(/No coins were sent/)
    expect(deps.pay).not.toHaveBeenCalled()
  })

  it('refuses a second payout while one is in flight', async () => {
    deps.hasPayoutInFlight.mockResolvedValue(true)
    await connectAndSettle()
    expect(claims.view('s1')).toMatchObject({ state: 'error', code: 'in_flight' })
    expect(deps.pay).not.toHaveBeenCalled()
  })

  it('reports a payout failure', async () => {
    deps.pay.mockRejectedValue(new Error('broadcast boom'))
    await connectAndSettle()
    expect(claims.view('s1')).toMatchObject({ state: 'error', code: 'failed', error: 'Faucet error: broadcast boom' })
  })

  it('marks an unscanned QR expired', async () => {
    status = 'expired'
    await claims.check('s1')
    expect(claims.view('s1')).toEqual({ state: 'expired' })
  })

  it('sweep forgets claims after the retention window', async () => {
    deps.now.mockReturnValue(1_000_000 + 16 * 60 * 1000)
    await claims.sweep()
    expect(claims.view('s1')).toBeNull()
  })

  it('refuses new claims once too many are waiting', async () => {
    let n = 0
    deps.createSession.mockImplementation(async () => ({ ...session, sessionId: `s${++n}` }))
    const fresh = new MobileClaims(deps as unknown as MobileClaimDeps)
    for (let i = 0; i < MAX_WAITING; i++) await fresh.create('1.2.3.4')
    await expect(fresh.create('1.2.3.4')).rejects.toMatchObject({ code: 429 })
  })
})
