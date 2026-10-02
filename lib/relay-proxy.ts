import { NextResponse } from 'next/server'

/**
 * Proxy to the mobile-wallet relay sidecar (relay/). Keeps the browser same-origin and lets the
 * phone resolve `${FAUCET_PUBLIC_URL}/api/session/:id` against the faucet's own domain.
 * Opt-in: with RELAY_INTERNAL_URL unset every call answers 503 and the UI falls back to the
 * plain "no wallet detected" panel.
 */

// Just above the relay's own 30s wallet-request timeout, so its 504 reaches the browser.
const TIMEOUT_MS = 35_000

/** Headers worth forwarding upstream; nothing else (cookies, Origin, etc.) leaves the faucet. */
const FORWARD_HEADERS = ['content-type', 'x-desktop-token'] as const

function relayBaseUrl(): string | null {
  const raw = process.env.RELAY_INTERNAL_URL
  if (!raw) return null
  try {
    return new URL(raw).toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export async function relayFetch(req: Request, path: string): Promise<Response> {
  const base = relayBaseUrl()
  if (!base) {
    return NextResponse.json({ error: 'Mobile wallet pairing is not enabled', code: 'relay_disabled' }, { status: 503 })
  }

  const headers = new Headers()
  for (const name of FORWARD_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }

  try {
    const upstream = await fetch(`${base}${path}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.text(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return new Response(upstream.status === 204 ? null : await upstream.text(), {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store, max-age=0',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Mobile wallet relay unreachable', code: 'relay_unreachable' }, { status: 502 })
  }
}

/** Session/topic ids are opaque tokens; reject anything that could change the upstream path. */
export function safeId(id: string): string | null {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null
}

export function badId(): Response {
  return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
}
