import type { IncomingMessage, ServerResponse } from 'node:http'
import { stringifyBRC100 } from '@bsv/sdk'
import { PROTOCOL_ID } from '@bsv/wallet-relay'

/** The subset of WalletRelayService the HTTP API uses — lets tests swap in a stub. */
export interface RelayLike {
  createSession(options?: { origin?: string }): Promise<{
    sessionId: string
    status: string
    qrDataUrl: string
    pairingUri: string
    desktopToken: string
  }>
  getSession(id: string): { sessionId: string; status: string; relay: string } | null
  sendRequest(sessionId: string, method: string, params: unknown, desktopToken?: string): Promise<unknown>
  deleteSession(sessionId: string, desktopToken: string): void
}

/**
 * The relay's half of the pairing tuple, exactly as @bsv/wallet-relay writes it into every QR:
 * `backendIdentityKey` is the relay wallet's identity key, `protocolID` is PROTOCOL_ID serialised
 * with stringifyBRC100 (the library's own createSession does both). BSV Wallet re-reads these from
 * GET /api/session/:id and requires string equality with the scanned QR.
 */
export interface PairingTuple {
  backendIdentityKey: string
  protocolID: string
}

/** Derive the pairing tuple from the wallet handed to WalletRelayService. Call once at startup. */
export async function pairingTuple(wallet: {
  getPublicKey(args: { identityKey: true }): Promise<{ publicKey: string }>
}): Promise<PairingTuple> {
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  return { backendIdentityKey: publicKey, protocolID: stringifyBRC100(PROTOCOL_ID) }
}

const MAX_BODY_BYTES = 256 * 1024

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status
  // Session info carries the desktop token / pairing secrets — never cache.
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  if (body === undefined) {
    res.end()
    return
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function errorCode(err: unknown): number | undefined {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'number' ? code : undefined
}

/**
 * REST API for the relay, mirroring the routes @bsv/wallet-relay registers on Express, but with
 * the QR origin pinned to `origin` (the faucet's public URL) instead of the caller's Origin header.
 * Only the faucet's Next.js proxy talks to this API; the phone reaches it via that proxy.
 */
export function createRequestHandler(relay: RelayLike, origin: string, tuple: PairingTuple) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://relay.internal')
    const method = req.method ?? 'GET'
    const token = req.headers['x-desktop-token']
    const desktopToken = typeof token === 'string' && token ? token : undefined
    const sessionMatch = /^\/api\/session\/([^/]+)$/.exec(url.pathname)
    const requestMatch = /^\/api\/request\/([^/]+)$/.exec(url.pathname)

    try {
      if (url.pathname === '/health' && method === 'GET') {
        return send(res, 200, { ok: true })
      }

      if (url.pathname === '/api/session' && method === 'GET') {
        try {
          return send(res, 200, await relay.createSession({ origin }))
        } catch (err) {
          return send(res, errorCode(err) === 429 ? 429 : 500, { error: errorMessage(err, 'Failed') })
        }
      }

      if (sessionMatch && method === 'GET') {
        const info = relay.getSession(decodeURIComponent(sessionMatch[1]))
        if (!info) return send(res, 404, { error: 'Session not found' })
        // The library returns only {sessionId, status, relay}; BSV Wallet also checks this response
        // against the QR's topic/backendIdentityKey/protocolID before it trusts the relay URL.
        return send(res, 200, {
          ...info,
          topic: info.sessionId,
          backendIdentityKey: tuple.backendIdentityKey,
          protocolID: tuple.protocolID,
        })
      }

      if (sessionMatch && method === 'DELETE') {
        if (!desktopToken) return send(res, 401, { error: 'Missing desktop token' })
        try {
          relay.deleteSession(decodeURIComponent(sessionMatch[1]), desktopToken)
          return send(res, 204)
        } catch (err) {
          const msg = errorMessage(err, 'Failed')
          const status = msg === 'Invalid desktop token' ? 401 : msg === 'Session not found' ? 404 : 500
          return send(res, status, { error: msg })
        }
      }

      if (requestMatch && method === 'POST') {
        const body = (await readJson(req)) as { method?: unknown; params?: unknown } | null
        if (!body || typeof body.method !== 'string' || !body.method) {
          return send(res, 400, { error: 'method is required' })
        }
        try {
          const response = await relay.sendRequest(
            decodeURIComponent(requestMatch[1]),
            body.method,
            body.params ?? {},
            desktopToken,
          )
          return send(res, 200, response)
        } catch (err) {
          const msg = errorMessage(err, 'Request failed')
          const code = errorCode(err)
          const status =
            msg === 'Invalid desktop token'
              ? 401
              : /exceeds|too large/i.test(msg)
                ? 413 // e.g. "Relay plaintext exceeds 48 KiB": the call can't fit in one relay message
                : msg.startsWith('Session is') || code === 400
                  ? 400
                  : code === 429
                    ? 429
                    : 504
          return send(res, status, { error: msg })
        }
      }

      return send(res, 404, { error: 'Not found' })
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message })
      return send(res, 500, { error: 'Internal error' })
    }
  }
}
