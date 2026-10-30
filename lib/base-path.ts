/**
 * Where the app is mounted. bsvblockchain.com/faucet is proxied here with the path unchanged, so
 * every page, asset and API route lives under /faucet; next.config.ts sets it as Next's basePath and
 * redirects the old root pages, and proxy.ts keeps /api/* answering at the root on this host.
 */
export const BASE_PATH = '/faucet'

/** Next prefixes links and its own assets with the base path; fetch() and CSS url() it does not. */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`
}

/** The faucet's public address, base path included. NEXT_PUBLIC_SITE_URL overrides it at build time. */
export const DEFAULT_SITE_URL = 'https://bsvblockchain.com/faucet'

/** Absolute public URL of `path` (e.g. '/api/claim'), with no doubled slash whatever the base ends in. */
export function siteUrl(path = '', base = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL): string {
  return `${base.replace(/\/+$/, '')}${path}`
}
