import { relayBaseUrl } from './relay-proxy'

/**
 * Server-side client for the mobile-wallet relay sidecar (relay/). The faucet server drives the
 * paired phone itself — the desktop token never leaves the server.
 */

export type RelayStatus = 'pending' | 'connected' | 'disconnected' | 'expired'

export interface RelaySession {
  sessionId: string
  desktopToken: string
  qrDataUrl: string
  pairingUri: string
}

/** A relay or wallet error. `code` is the HTTP status, or the wallet's RPC error code. */
export class RelayError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'RelayError'
  }
}

export function relayEnabled(): boolean {
  return relayBaseUrl() !== null
}

type Body = Record<string, unknown> & { error?: unknown }

function errorText(body: Body, status: number): string {
  return typeof body.error === 'string' ? body.error : `Relay HTTP ${status}`
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<{ status: number; body: Body }> {
  const base = relayBaseUrl()
  if (!base) throw new RelayError('Mobile wallet pairing is not enabled', 503)
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new RelayError('Mobile wallet relay unreachable', 502)
  }
  const body = (await res.json().catch(() => ({}))) as Body
  return { status: res.status, body: body && typeof body === 'object' ? body : {} }
}

export async function createRelaySession(): Promise<RelaySession> {
  const { status, body } = await call('/api/session')
  if (status !== 200) throw new RelayError(errorText(body, status), status)
  return body as unknown as RelaySession
}

/** Session status, or 'expired' if the relay no longer knows it (e.g. it restarted). */
export async function getRelayStatus(sessionId: string): Promise<RelayStatus> {
  const { status, body } = await call(`/api/session/${encodeURIComponent(sessionId)}`)
  if (status === 404) return 'expired'
  if (status !== 200) throw new RelayError(errorText(body, status), status)
  return body.status as RelayStatus
}

/** Call a BRC-100 method on the paired phone and return its result. */
export async function relayCall<T>(session: Pick<RelaySession, 'sessionId' | 'desktopToken'>, method: string, params: unknown): Promise<T> {
  const { status, body } = await call(
    `/api/request/${encodeURIComponent(session.sessionId)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-desktop-token': session.desktopToken },
      body: JSON.stringify({ method, params }),
    },
    // The relay gives the phone 30s to answer.
    35_000,
  )
  if (status !== 200) throw new RelayError(errorText(body, status), status)
  if (body.error) {
    const { code, message } = body.error as { code?: number; message?: string }
    throw new RelayError(message ?? 'Mobile wallet error', code)
  }
  return body.result as T
}
