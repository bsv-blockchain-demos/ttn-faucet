import type { IncomingMessage, ServerResponse } from 'node:http'

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
export function createRequestHandler(relay: RelayLike, origin: string) {
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
        return info ? send(res, 200, info) : send(res, 404, { error: 'Session not found' })
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
