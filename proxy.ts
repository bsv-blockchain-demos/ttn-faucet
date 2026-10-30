import { NextResponse, type NextRequest } from 'next/server'
import { BASE_PATH } from './lib/base-path'

/**
 * The API stays at its root address too: external clients, the relay's callback and health probes
 * POST and GET /api/* and need not follow a redirect, so it is rewritten onto /faucet/api/*.
 * next.config.ts rewrites can't do this (Next only allows `basePath: false` rewrites to an absolute
 * URL), and a `matcher` can't either (Next prefixes every matcher with the basePath), so this runs
 * on every request and lets everything but root /api/* through untouched.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = new URL(request.url)
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return NextResponse.next()
  return NextResponse.rewrite(new URL(`${BASE_PATH}${pathname}${search}`, request.url))
}
