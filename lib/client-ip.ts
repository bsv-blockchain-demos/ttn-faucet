import { isIP } from 'node:net'

/** Who is claiming, as far as the request headers tell. */
export interface ClientIp {
  /** The per-IP rate-limit key: the visitor's address, or 'unknown'. */
  ip: string
  /**
   * The address to send Turnstile siteverify as `remoteip`. Set only when it came from
   * CF-Connecting-IP; otherwise undefined, because a wrong `remoteip` is worse than none.
   */
  remoteIp?: string
}

const valid = (value: string | null | undefined): string | undefined => {
  const v = value?.trim()
  return v && isIP(v) ? v : undefined
}

/**
 * The client's IP. The faucet is served through Cloudflare, which sets CF-Connecting-IP to the
 * visitor and overwrites any client-supplied copy. X-Forwarded-For is the fallback: its first
 * entry, which is the visitor only when no proxy between Cloudflare and the faucet rewrites it.
 * A value that is not a bare IPv4/IPv6 address (blank, a port attached, garbage) falls through to
 * the next source, and to 'unknown' at the end.
 */
export function clientIp(headers: Headers): ClientIp {
  const cf = valid(headers.get('cf-connecting-ip'))
  if (cf) return { ip: cf, remoteIp: cf }
  const forwarded = valid(headers.get('x-forwarded-for')?.split(',')[0])
  return { ip: forwarded ?? 'unknown' }
}
