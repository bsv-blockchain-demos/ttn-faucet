import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { MerklePath, P2PKH, PrivateKey, ProtoWallet, Transaction } from '@bsv/sdk'
import { WalletRelayService, type PairingParams } from '@bsv/wallet-relay'
import { WalletPairingSession } from '@bsv/wallet-relay/client'
import { createRequestHandler } from './server.js'

// End-to-end over real sockets: our HTTP API + WalletRelayService, with a simulated phone
// (the library's own mobile-side WalletPairingSession) on the other end of the WebSocket.

let cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.forEach((fn) => fn())
  cleanup = []
})

async function startRelay(onSessionConnected?: (sessionId: string) => void) {
  const server = http.createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${port}`
  const relay = new WalletRelayService({
    server,
    wallet: new ProtoWallet(PrivateKey.fromRandom()),
    origin,
    relayUrl: `ws://127.0.0.1:${port}`,
    allowedOrigins: [origin],
    schema: 'bsv-wallet',
    onSessionConnected,
  })
  const handle = createRequestHandler(relay, origin)
  server.on('request', (req, res) => void handle(req, res))
  cleanup.push(() => {
    relay.stop()
    server.close()
  })
  return { origin, relay }
}

// bsv-wallet parses `bsv-wallet://pair?…` itself (the library's parsePairingUri only knows its
// default scheme), so read the query the same way the app does.
function pairingParams(uri: string): PairingParams {
  expect(uri).toMatch(/^bsv-wallet:\/\/pair\?/)
  return Object.fromEntries(new URL(uri).searchParams) as unknown as PairingParams
}

/** A payout-shaped Atomic BEEF: one P2PKH payment spending a (fake-)proven parent. */
async function atomicBeef(): Promise<number[]> {
  const key = PrivateKey.fromRandom()
  const parent = new Transaction(1, [], [{ lockingScript: new P2PKH().lock(key.toAddress()), satoshis: 1000 }], 0)
  parent.merklePath = new MerklePath(100, [
    [
      { offset: 0, hash: parent.id('hex'), txid: true },
      { offset: 1, hash: '00'.repeat(32) },
    ],
  ])
  const tx = new Transaction()
  tx.addInput({ sourceTransaction: parent, sourceOutputIndex: 0, unlockingScriptTemplate: new P2PKH().unlock(key) })
  tx.addOutput({ lockingScript: new P2PKH().lock(PrivateKey.fromRandom().toAddress()), satoshis: 900 })
  await tx.sign()
  return tx.toAtomicBEEF()
}

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v !== undefined) return v
    if (Date.now() > deadline) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('relay end-to-end', () => {
  it('pairs a phone and forwards internalizeAction with a number[] tx', async () => {
    const { origin } = await startRelay()

    const created = await (await fetch(`${origin}/api/session`)).json()
    expect(created.qrDataUrl).toMatch(/^data:image\/png;base64,/)

    const params = pairingParams(created.pairingUri)
    expect(params.origin).toBe(origin)

    const received: Array<{ method: string; params: any }> = []
    const phone = new WalletPairingSession(new ProtoWallet(PrivateKey.fromRandom()), params, {
      onApprovalRequired: async () => true,
    })
    phone.onRequest(async (method, params) => {
      received.push({ method, params })
      return { accepted: true }
    })
    cleanup.push(() => phone.disconnect())
    await phone.resolveRelay()
    await phone.connect()

    await waitFor(async () => {
      const s = await (await fetch(`${origin}/api/session/${created.sessionId}`)).json()
      return s.status === 'connected' ? s : undefined
    })

    const tx = await atomicBeef()
    const res = await fetch(`${origin}/api/request/${created.sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desktop-token': created.desktopToken },
      body: JSON.stringify({
        method: 'internalizeAction',
        params: {
          tx,
          description: 'Teratestnet faucet payout',
          labels: ['faucet'],
          outputs: [
            {
              outputIndex: 0,
              protocol: 'wallet payment',
              paymentRemittance: {
                derivationPrefix: 'cHJlZml4',
                derivationSuffix: 'c3VmZml4',
                senderIdentityKey: PrivateKey.fromRandom().toPublicKey().toString(),
              },
            },
          ],
        },
      }),
    })
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(200)
    expect(body.result, JSON.stringify(body)).toEqual({ accepted: true })
    expect(received).toHaveLength(1)
    expect(received[0].method).toBe('internalizeAction')
    expect(Array.from(received[0].params.tx)).toEqual(tx)
  }, 20000)

  it('rejects a request with the wrong desktop token', async () => {
    const { origin } = await startRelay()
    const created = await (await fetch(`${origin}/api/session`)).json()
    const params = pairingParams(created.pairingUri)
    const phone = new WalletPairingSession(new ProtoWallet(PrivateKey.fromRandom()), params, {
      onApprovalRequired: async () => true,
    })
    phone.onRequest(async () => ({}))
    cleanup.push(() => phone.disconnect())
    await phone.resolveRelay()
    await phone.connect()
    await waitFor(async () => {
      const s = await (await fetch(`${origin}/api/session/${created.sessionId}`)).json()
      return s.status === 'connected' ? s : undefined
    })

    const res = await fetch(`${origin}/api/request/${created.sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desktop-token': 'wrong' },
      body: JSON.stringify({ method: 'getPublicKey', params: { identityKey: true } }),
    })
    expect(res.status).toBe(401)
  }, 20000)

  it('reports the session connected by the time onSessionConnected fires', async () => {
    let statusAtCallback: string | undefined
    let relayRef: WalletRelayService | undefined
    const { origin, relay } = await startRelay((id) => {
      statusAtCallback = relayRef?.getSession(id)?.status
    })
    relayRef = relay
    const created = await (await fetch(`${origin}/api/session`)).json()
    const phone = new WalletPairingSession(new ProtoWallet(PrivateKey.fromRandom()), pairingParams(created.pairingUri), {
      onApprovalRequired: async () => true,
    })
    phone.onRequest(async () => ({}))
    cleanup.push(() => phone.disconnect())
    await phone.resolveRelay()
    await phone.connect()
    await waitFor(async () => (statusAtCallback ? statusAtCallback : undefined))
    // The faucet re-checks status when notified, so it must already read 'connected'.
    expect(statusAtCallback).toBe('connected')
  }, 20000)
})
