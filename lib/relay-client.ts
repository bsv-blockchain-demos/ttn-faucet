/**
 * Browser client for mobile-wallet pairing over @bsv/wallet-relay, talking to the faucet's
 * same-origin proxy routes (/api/session, /api/request). Encryption to the phone happens in the
 * relay sidecar; the browser only holds the session id + desktop token (a bearer secret).
 *
 * (A minimal stand-in for @bsv/wallet-relay/client's WalletRelayClient, which requires
 * @bsv/sdk 2.x — the faucet is on 1.x.)
 */

export type PairingStatus = 'pending' | 'connected' | 'disconnected' | 'expired'

export interface PairingSession {
  sessionId: string
  desktopToken: string
}

export interface NewPairingSession extends PairingSession {
  status: PairingStatus
  qrDataUrl: string
  pairingUri: string
}

/** A wallet call the phone rejected or could not complete. `code` 4001 = user declined. */
export class RelayRequestError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'RelayRequestError'
  }
}

const STORAGE_KEY = 'faucet.mobileWalletSession'

type Body = Record<string, unknown>

async function json(res: Response): Promise<Body> {
  try {
    const body = await res.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

function httpError(res: Response, body: Body): RelayRequestError {
  return new RelayRequestError(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`, res.status)
}

/** Create a new pairing session. Throws if the relay is disabled (503) or unreachable. */
export async function createPairingSession(): Promise<NewPairingSession> {
  const res = await fetch('/api/session', { cache: 'no-store' })
  const body = await json(res)
  if (!res.ok) throw httpError(res, body)
  const session = body as unknown as NewPairingSession
  saveSession({ sessionId: session.sessionId, desktopToken: session.desktopToken })
  return session
}

/** Current status, or 'expired' if the relay no longer knows the session (e.g. it restarted). */
export async function getPairingStatus(sessionId: string): Promise<PairingStatus> {
  const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
  if (res.status === 404) return 'expired'
  const body = await json(res)
  if (!res.ok) throw httpError(res, body)
  return body.status as PairingStatus
}

/** Call a BRC-100 wallet method on the paired phone and return its result. */
export async function relayRequest<T>(session: PairingSession, method: string, params: unknown): Promise<T> {
  const res = await fetch(`/api/request/${encodeURIComponent(session.sessionId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-desktop-token': session.desktopToken },
    body: JSON.stringify({ method, params }),
  })
  const body = await json(res)
  if (!res.ok) throw httpError(res, body)
  if (body.error) {
    const { code, message } = body.error as { code?: number; message?: string }
    throw new RelayRequestError(
      code === 4001 ? 'The request was declined in your mobile wallet.' : (message ?? 'Mobile wallet error'),
      code,
    )
  }
  return body.result as T
}

/** End the session on the relay (closes the phone's socket) and forget it locally. */
export async function endPairingSession(session: PairingSession): Promise<void> {
  clearSession()
  await fetch(`/api/session/${encodeURIComponent(session.sessionId)}`, {
    method: 'DELETE',
    headers: { 'x-desktop-token': session.desktopToken },
  }).catch(() => {})
}

// sessionStorage keeps a pairing alive across reloads of this tab only. Storage can be missing or
// throw (private mode, blocked site data) — pairing then just doesn't survive a reload.

export function loadSession(): PairingSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return typeof s?.sessionId === 'string' && typeof s?.desktopToken === 'string'
      ? { sessionId: s.sessionId, desktopToken: s.desktopToken }
      : null
  } catch {
    return null
  }
}

function saveSession(s: PairingSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {}
}

export function clearSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}
