import { isIP } from 'node:net'

/** Who is claiming, as far as the request headers tell. */
export interface ClientIp {
  /**
   * The per-IP rate-limit key: the visitor's IPv4 address, the /64 prefix of their IPv6 address
   * (e.g. `2001:db8:1:2::/64`), 'cf-worker' (one shared bucket for every cross-zone Worker
   * subrequest), or 'unknown' (one shared bucket when no header names the visitor).
   */
  ip: string
  /**
   * The address to send Turnstile siteverify as `remoteip`: the full address (any port dropped). Set
   * only when it came from CF-Connecting-IP; otherwise undefined, because a wrong `remoteip` is
   * worse than none.
   */
  remoteIp?: string
}

/**
 * Cloudflare's fixed CF-Connecting-IP for cross-zone Worker subrequests, i.e. the Worker, not the
 * visitor: https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip-in-worker-subrequests
 */
const WORKER_SUBREQUEST_IP = '2a06:98c0:3600::103'

/** `1.2.3.4:5678` → `1.2.3.4`, `[2001:db8::1]:443` and `[2001:db8::1]` → `2001:db8::1`. */
const stripPort = (v: string) => v.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1] ?? v.match(/^([\d.]+):\d+$/)?.[1] ?? v

/** A bare IPv4/IPv6 address, after trimming and dropping a port some proxies attach. */
const valid = (value: string | null | undefined): string | undefined => {
  const v = value?.trim()
  if (!v) return undefined
  const address = stripPort(v)
  return isIP(address) ? address : undefined
}

/** The eight 16-bit groups of a valid IPv6 address, whatever its spelling. */
function ipv6Groups(address: string): number[] {
  let addr = address.split('%')[0]
  const tail: number[] = []
  const v4 = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number)
    tail.push((a << 8) | b, (c << 8) | d)
    addr = addr.slice(0, -v4[0].length) + '0:0' // placeholder groups, replaced below
  }
  const [head, rest] = addr.split('::')
  const parse = (s: string | undefined) => (s ? s.split(':').map((h) => parseInt(h, 16)) : [])
  const left = parse(head)
  const right = parse(rest)
  const groups =
    rest === undefined ? left : [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right]
  if (tail.length) groups.splice(6, 2, ...tail)
  return groups
}

const WORKER_GROUPS = ipv6Groups(WORKER_SUBREQUEST_IP)
const isWorkerSubrequest = (address: string) =>
  isIP(address) === 6 && ipv6Groups(address).every((g, i) => g === WORKER_GROUPS[i])

/**
 * The rate-limit key for an address. IPv4 as is; IPv4-mapped IPv6 (`::ffff:a.b.c.d`) as the IPv4;
 * other IPv6 as its /64, since one client usually holds a whole /64 and could otherwise rotate
 * addresses for a fresh bucket per claim.
 */
function limitKey(address: string): string {
  if (isIP(address) === 4) return address
  const g = ipv6Groups(address)
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.')
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`
}

const warned = new Set<string>()

/** Log the first time a request falls into a shared bucket, so a misconfigured deployment shows. */
function sharedBucket(ip: 'cf-worker' | 'unknown'): ClientIp {
  if (!warned.has(ip)) {
    warned.add(ip)
    console.warn(
      ip === 'cf-worker'
        ? "client-ip: CF-Connecting-IP is Cloudflare's cross-zone Worker address; these requests share the 'cf-worker' rate-limit bucket. Logged once per process."
        : "client-ip: no visitor address in CF-Connecting-IP or X-Forwarded-For; these requests share the 'unknown' rate-limit bucket. Logged once per process.",
    )
  }
  return { ip }
}

/**
 * The client's IP. Cloudflare sets CF-Connecting-IP to the visitor on a proxied host, and on a
 * same-zone Worker subrequest (from the X-Real-IP the Worker sets). On a cross-zone Worker
 * subrequest it is Cloudflare's fixed Worker address: those requests go into one 'cf-worker'
 * bucket rather than trusting the X-Forwarded-For the calling Worker chose. X-Forwarded-For (its
 * first entry) is used only when CF-Connecting-IP is absent or invalid, and is the visitor only
 * when everything in front of the faucet preserves it. A port is dropped; any other value that is
 * not a bare IPv4/IPv6 address (blank, garbage) falls through to the next source, and to 'unknown'
 * at the end.
 */
export function clientIp(headers: Headers): ClientIp {
  const cf = valid(headers.get('cf-connecting-ip'))
  if (cf) return isWorkerSubrequest(cf) ? sharedBucket('cf-worker') : { ip: limitKey(cf), remoteIp: cf }
  const forwarded = valid(headers.get('x-forwarded-for')?.split(',')[0])
  return forwarded ? { ip: limitKey(forwarded) } : sharedBucket('unknown')
}
