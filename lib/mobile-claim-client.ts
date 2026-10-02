import type { MobileClaimView, NewMobileClaim } from './mobile-claim'

/**
 * Browser side of mobile-wallet claims. The server runs the claim when the phone connects; the
 * page only starts it (QR / deep link) and reads the outcome. The pending claim is remembered in
 * sessionStorage because on a phone the browser tab may be reloaded or discarded while the user
 * is in BSV Wallet.
 */

export type { MobileClaimView, NewMobileClaim }

export class MobileClaimError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'MobileClaimError'
  }
}

const STORAGE_KEY = 'faucet.mobileClaim'

/** Start a claim. Throws MobileClaimError (503 when mobile pairing is disabled). */
export async function startMobileClaim(): Promise<NewMobileClaim> {
  const res = await fetch('/api/claim/mobile', { method: 'POST', cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new MobileClaimError(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`, res.status)
  savePendingClaim(body as NewMobileClaim)
  return body as NewMobileClaim
}

/** The claim's current outcome, or null if the server no longer knows it (e.g. it restarted). */
export async function pollMobileClaim(sessionId: string): Promise<MobileClaimView | null> {
  const res = await fetch(`/api/claim/mobile/${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new MobileClaimError(`HTTP ${res.status}`, res.status)
  return (await res.json()) as MobileClaimView
}

// Storage can be missing or throw (private mode, blocked site data); the claim then just isn't
// resumed after a reload.

export function loadPendingClaim(): NewMobileClaim | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    return typeof s?.sessionId === 'string' && typeof s?.qrDataUrl === 'string' && typeof s?.pairingUri === 'string'
      ? { sessionId: s.sessionId, qrDataUrl: s.qrDataUrl, pairingUri: s.pairingUri }
      : null
  } catch {
    return null
  }
}

function savePendingClaim(c: NewMobileClaim) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {}
}

export function clearPendingClaim() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}
